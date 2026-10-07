document.addEventListener('DOMContentLoaded', async () => {
  let authRedirectTarget = null;

  const isAdminUser = (user) => !!user && user.role === 'admin';

  // 예매 내역 카드 (마이페이지 + 헤더 모달 공용)
  const bookingCardHTML = (booking, cancelAttr) => {
    const seats = booking.seats || [];
    const booked = new Date(booking.created_at);
    const bookedLabel = `${booked.getFullYear()}.${String(booked.getMonth() + 1).padStart(2, '0')}.${String(booked.getDate()).padStart(2, '0')}`;
    return `
      <li class="ticket-item">
        <div class="ticket-item-main">
          <p class="ticket-item-title">제 3회 연세예술원 졸업영화제 · 매직아워</p>
          <dl class="ticket-item-info">
            <div><dt>상영 일시</dt><dd>2026.12.04 (금) 16:00</dd></div>
            <div><dt>장소</dt><dd>미래캠퍼스 RIS 대강당</dd></div>
            <div><dt>인원</dt><dd>${seats.length}명</dd></div>
            <div><dt>예매일</dt><dd>${bookedLabel}</dd></div>
          </dl>
          <div class="ticket-item-seats">${seats.map((c) => `<span class="seat-chip">${c}</span>`).join('')}</div>
        </div>
        <div class="ticket-item-actions">
          <button class="ticket-view-btn" type="button" data-ticket-view data-code="MH-${String(booking.id).padStart(4, '0')}" data-seats="${seats.join(',')}">입장 확인 화면</button>
          <button class="ticket-item-cancel" type="button" ${cancelAttr}="${booking.id}">예매 취소</button>
        </div>
      </li>`;
  };
  // 현장 데스크용 입장 확인 화면: 이름·좌석·예매번호 + 실시간 시계(캡처본 구분용)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ticket-view]');
    if (!btn) return;
    const seats = btn.dataset.seats.split(',').filter(Boolean);
    const overlay = document.createElement('div');
    overlay.className = 'ticket-pass-overlay';
    overlay.innerHTML = `
      <div class="ticket-pass" role="dialog" aria-modal="true">
        <p class="ticket-pass-eyebrow">제 3회 연세예술원 졸업영화제 · 매직아워</p>
        <p class="ticket-pass-name">${(window.__mhUserName || '')}</p>
        <div class="ticket-pass-seats">${seats.map((c) => `<span>${c}</span>`).join('')}</div>
        <dl class="ticket-pass-info">
          <div><dt>예매번호</dt><dd>${btn.dataset.code}</dd></div>
          <div><dt>인원</dt><dd>${seats.length}명</dd></div>
          <div><dt>일시</dt><dd>2026.12.04 (금) 16:00</dd></div>
          <div><dt>장소</dt><dd>RIS 대강당</dd></div>
        </dl>
        <p class="ticket-pass-clock" data-pass-clock></p>
        <p class="ticket-pass-note">이 화면을 입장 데스크에서 보여 주시면 티켓을 드립니다.</p>
        <button type="button" class="ticket-pass-close">닫기</button>
      </div>`;
    document.body.appendChild(overlay);
    const clock = overlay.querySelector('[data-pass-clock]');
    const tick = () => { clock.textContent = new Date().toLocaleString('ko-KR', { hour12: false }); };
    tick();
    const timer = setInterval(tick, 1000);
    const close = () => { clearInterval(timer); overlay.remove(); };
    overlay.querySelector('.ticket-pass-close').addEventListener('click', close);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  });

  // 이메일 + 아이디 + 연락처가 모두 맞으면 새 비밀번호로 바로 변경 (supabase-schema-addon-6.sql 필요)
  const resetPasswordWithIdentity = async ({ email, username, phone, pw, pw2 }) => {
    if (pw.length < 6) return '비밀번호는 6자 이상이어야 해요.';
    if (pw !== pw2) return '두 비밀번호가 서로 달라요.';
    const { data, error } = await supabaseClient.rpc('reset_password_with_identity', {
      p_email: email, p_username: username, p_phone: phone, p_new_password: pw,
    });
    if (error) return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (data === 'OK') return null;
    if (data === 'LOCKED') return '시도 횟수를 넘었어요. 15분 뒤에 다시 시도해 주세요.';
    if (data === 'WEAK') return '비밀번호는 6자 이상이어야 해요.';
    return '입력한 이메일·아이디·연락처가 가입 정보와 일치하지 않아요.';
  };

  const bookingEmptyHTML = '<li class="ticket-empty"><p>아직 예매 내역이 없습니다.</p><a class="primary-btn" href="reserve.html">좌석 예매하기</a></li>';

  const loadCurrentUser = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;
    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (error || !profile) return null;
    return profile;
  };

  const currentUser = await loadCurrentUser();
  window.__mhUserName = currentUser ? (currentUser.name || currentUser.username || '') : '';

  const signOutAndRedirect = async (target) => {
    await supabaseClient.auth.signOut();
    window.location.href = target;
  };

  const getAuthOverlay = () => {
    let overlay = document.getElementById('login-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'login-modal-overlay';
    overlay.id = 'login-modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="login-modal" id="auth-modal-box" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(overlay);

    const closeModal = () => { overlay.hidden = true; };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    return overlay;
  };

  const AUTH_VIEWS = {
    login: () => `
      <button class="login-modal-close" type="button" aria-label="닫기">×</button>
      <h2>로그인</h2>
      <p class="login-modal-sub">예매를 위해 로그인해 주세요.</p>
      <form id="auth-form-login">
        <label for="auth-identifier">아이디</label>
        <input type="text" id="auth-identifier" placeholder="아이디를 입력하세요" autocomplete="username" required />
        <label for="auth-password">비밀번호</label>
        <input type="password" id="auth-password" placeholder="비밀번호를 입력하세요" autocomplete="current-password" required />
        <p class="login-modal-error" id="auth-error" hidden>아이디 또는 비밀번호가 올바르지 않습니다.</p>
        <button class="login-modal-submit" type="submit">로그인</button>
      </form>
      <button class="login-modal-alt" type="button" data-auth-nav="find">아이디 · 비밀번호 찾기</button>
      <button class="login-modal-alt" type="button" data-auth-nav="signup">회원가입</button>
    `,
    signup: () => `
      <div class="auth-modal-header">
        <button class="auth-back-btn" type="button" data-auth-nav="login" aria-label="뒤로가기">←</button>
        <div>
          <h2>회원가입</h2>
          <p class="login-modal-sub">새 계정을 만드세요</p>
        </div>
      </div>
      <form id="auth-form-signup">
        <label for="auth-signup-name">이름 <span class="auth-required">*</span></label>
        <input type="text" id="auth-signup-name" placeholder="이름을 입력하세요" required />
        <label for="auth-signup-username">아이디 <span class="auth-required">*</span></label>
        <input type="text" id="auth-signup-username" placeholder="아이디를 입력하세요" autocomplete="username" required />
        <label for="auth-signup-password">비밀번호 <span class="auth-required">*</span></label>
        <input type="password" id="auth-signup-password" placeholder="비밀번호를 입력하세요" autocomplete="new-password" required />
        <label for="auth-signup-password2">비밀번호 확인 <span class="auth-required">*</span></label>
        <input type="password" id="auth-signup-password2" placeholder="비밀번호를 다시 입력하세요" autocomplete="new-password" required />
        <label for="auth-signup-email">이메일 <span class="auth-required">*</span></label>
        <input type="email" id="auth-signup-email" placeholder="이메일을 입력하세요" autocomplete="email" required />
        <label for="auth-signup-phone">연락처 <span class="auth-required">*</span></label>
        <input type="tel" id="auth-signup-phone" placeholder="010-0000-0000" autocomplete="tel" required />
        <p class="login-modal-error" id="auth-error" hidden></p>
        <button class="login-modal-submit" type="submit">가입하기</button>
      </form>
      <button class="login-modal-alt-btn" type="button" data-auth-nav="login">이미 계정이 있어요</button>
    `,
    find: () => `
      <div class="auth-modal-header">
        <button class="auth-back-btn" type="button" data-auth-nav="login" aria-label="뒤로가기">←</button>
        <div>
          <h2>계정 찾기</h2>
          <p class="login-modal-sub">아이디 또는 비밀번호를 찾으세요</p>
        </div>
      </div>
      <div class="auth-tabs">
        <button type="button" class="auth-tab active" data-find-tab="id">아이디 찾기</button>
        <button type="button" class="auth-tab" data-find-tab="password">비밀번호 찾기</button>
      </div>
      <form id="auth-form-find-id" class="auth-find-panel">
        <label for="auth-find-email">이메일</label>
        <input type="email" id="auth-find-email" placeholder="가입하신 이메일을 입력하세요" required />
        <p class="login-modal-error" id="auth-error-id" hidden></p>
        <p class="login-modal-success" id="auth-success-id" hidden></p>
        <button class="login-modal-submit" type="submit">아이디 찾기</button>
      </form>
      <form id="auth-form-find-password" class="auth-find-panel" hidden>
        <label for="auth-pr-email">이메일</label>
        <input type="email" id="auth-pr-email" placeholder="가입한 이메일" required />
        <label for="auth-pr-username">아이디</label>
        <input type="text" id="auth-pr-username" placeholder="가입한 아이디" required />
        <label for="auth-pr-phone">연락처</label>
        <input type="tel" id="auth-pr-phone" placeholder="010-0000-0000" required />
        <label for="auth-pr-pw">새 비밀번호</label>
        <input type="password" id="auth-pr-pw" minlength="6" placeholder="6자 이상" required />
        <label for="auth-pr-pw2">새 비밀번호 확인</label>
        <input type="password" id="auth-pr-pw2" minlength="6" placeholder="한 번 더 입력" required />
        <p class="login-modal-error" id="auth-error-password" hidden></p>
        <p class="login-modal-success" id="auth-success-password" hidden></p>
        <button class="login-modal-submit" type="submit">비밀번호 변경</button>
      </form>
      <button class="login-modal-alt-btn" type="button" data-auth-nav="login">로그인으로 돌아가기</button>
    `
  };

  const renderAuthView = (view) => {
    const overlay = getAuthOverlay();
    const box = overlay.querySelector('#auth-modal-box');
    box.innerHTML = AUTH_VIEWS[view]();
    overlay.hidden = false;

    box.querySelectorAll('[data-auth-nav]').forEach((btn) => {
      btn.addEventListener('click', () => renderAuthView(btn.dataset.authNav));
    });
    box.querySelector('.login-modal-close')?.addEventListener('click', () => { overlay.hidden = true; });

    if (view === 'login') {
      box.querySelector('#auth-identifier')?.focus();
      box.querySelector('#auth-form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = box.querySelector('#auth-identifier').value.trim();
        const password = box.querySelector('#auth-password').value.trim();
        const errorEl = box.querySelector('#auth-error');
        errorEl.hidden = true;

        let email = identifier;
        if (!identifier.includes('@')) {
          const { data: foundEmail } = await supabaseClient.rpc('get_email_by_username', { lookup_username: identifier });
          if (!foundEmail) {
            errorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            errorEl.hidden = false;
            return;
          }
          email = foundEmail;
        }

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          errorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
          errorEl.hidden = false;
          return;
        }

        window.location.href = authRedirectTarget || window.location.pathname + window.location.search;
      });
    }

    if (view === 'signup') {
      box.querySelector('#auth-signup-name')?.focus();
      box.querySelector('#auth-form-signup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = box.querySelector('#auth-error');
        errorEl.hidden = true;
        const name = box.querySelector('#auth-signup-name').value.trim();
        const username = box.querySelector('#auth-signup-username').value.trim();
        const password = box.querySelector('#auth-signup-password').value;
        const password2 = box.querySelector('#auth-signup-password2').value;
        const email = box.querySelector('#auth-signup-email').value.trim();
        const phone = box.querySelector('#auth-signup-phone').value.trim();

        if (password !== password2) {
          errorEl.textContent = '비밀번호가 일치하지 않습니다.';
          errorEl.hidden = false;
          return;
        }

        const { data: existingEmail } = await supabaseClient.rpc('get_email_by_username', { lookup_username: username });
        if (existingEmail) {
          errorEl.textContent = '이미 사용 중인 아이디입니다.';
          errorEl.hidden = false;
          return;
        }

        const { error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { username, name, phone } }
        });

        if (error) {
          errorEl.textContent = error.message.includes('already registered') || error.message.includes('already been registered')
            ? '이미 사용 중인 이메일입니다.'
            : `회원가입 중 오류가 발생했습니다: ${error.message}`;
          errorEl.hidden = false;
          return;
        }

        renderAuthView('login');
      });
    }

    if (view === 'find') {
      const tabs = box.querySelectorAll('.auth-tab');
      const panels = {
        id: box.querySelector('#auth-form-find-id'),
        password: box.querySelector('#auth-form-find-password')
      };
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.toggle('active', t === tab));
          const target = tab.dataset.findTab;
          panels.id.hidden = target !== 'id';
          panels.password.hidden = target !== 'password';
        });
      });

      panels.id.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = box.querySelector('#auth-find-email').value.trim();
        const errorEl = box.querySelector('#auth-error-id');
        const successEl = box.querySelector('#auth-success-id');
        errorEl.hidden = true;
        successEl.hidden = true;

        const { data: username } = await supabaseClient.rpc('find_username_by_email', { lookup_email: email });
        if (!username) {
          errorEl.textContent = '입력하신 이메일로 가입된 회원을 찾을 수 없습니다.';
          errorEl.hidden = false;
          return;
        }
        successEl.textContent = `아이디: ${username}`;
        successEl.hidden = false;
      });

      panels.password.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = box.querySelector('#auth-error-password');
        const successEl = box.querySelector('#auth-success-password');
        errorEl.hidden = true;
        successEl.hidden = true;
        const msg = await resetPasswordWithIdentity({
          email: box.querySelector('#auth-pr-email').value.trim(),
          username: box.querySelector('#auth-pr-username').value.trim(),
          phone: box.querySelector('#auth-pr-phone').value.trim(),
          pw: box.querySelector('#auth-pr-pw').value,
          pw2: box.querySelector('#auth-pr-pw2').value,
        });
        if (msg) { errorEl.textContent = msg; errorEl.hidden = false; return; }
        successEl.textContent = '비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.';
        successEl.hidden = false;
        panels.password.reset();
      });
    }
  };

  window.requireLoginThen = (target) => {
    if (currentUser) {
      window.location.href = target;
      return;
    }
    authRedirectTarget = target;
    renderAuthView('login');
  };

  const getMypageOverlay = () => {
    let overlay = document.getElementById('mypage-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'login-modal-overlay';
    overlay.id = 'mypage-modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="login-modal mypage-modal-box" id="mypage-modal-box" role="dialog" aria-modal="true">
        <button class="login-modal-close" type="button" aria-label="닫기">×</button>
        <h2>마이페이지</h2>
        <div class="mypage-modal-section">
          <h3>내 정보</h3>
          <ul class="info-list">
            <li><strong>이름</strong><span data-mypage-name>—</span></li>
            <li><strong>이메일</strong><span data-mypage-email>—</span></li>
          </ul>
          <button class="secondary-btn" type="button" data-mypage-logout style="margin-top: 14px;">로그아웃</button>
        </div>
        <div class="mypage-modal-section">
          <h3>예매 내역</h3>
          <ul class="booking-list" data-mypage-booking-list>
            <li>아직 예매 내역이 없습니다.</li>
          </ul>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => { overlay.hidden = true; };
    overlay.querySelector('.login-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    return overlay;
  };

  const openMypageModal = async () => {
    if (!currentUser) {
      renderAuthView('login');
      return;
    }

    const overlay = getMypageOverlay();
    overlay.querySelector('[data-mypage-name]').textContent = currentUser.name || currentUser.username;
    overlay.querySelector('[data-mypage-email]').textContent = currentUser.email || '—';

    const bookingList = overlay.querySelector('[data-mypage-booking-list]');
    const renderMypageBookings = async () => {
      const { data: userBookings, error } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error || !userBookings || !userBookings.length) {
        bookingList.innerHTML = bookingEmptyHTML;
        return;
      }

      bookingList.innerHTML = userBookings.map((b) => bookingCardHTML(b, 'data-mypage-cancel')).join('');

      bookingList.querySelectorAll('[data-mypage-cancel]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const bookingId = btn.getAttribute('data-mypage-cancel');
          await supabaseClient.from('bookings').delete().eq('id', bookingId);
          renderMypageBookings();
        });
      });
    };
    await renderMypageBookings();

    overlay.querySelector('[data-mypage-logout]').onclick = () => signOutAndRedirect('index.html');

    overlay.hidden = false;
  };
  window.openMypageModal = openMypageModal;

  const openAccountEntry = () => {
    if (!currentUser) {
      renderAuthView('login');
      return;
    }
    openMypageModal();
  };
  window.openAccountEntry = openAccountEntry;

  document.querySelectorAll('[data-header-login]').forEach((button) => {
    button.textContent = currentUser ? '마이페이지' : '로그인';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openAccountEntry();
    });

    if (currentUser) {
      const actionsWrap = button.closest('.top-actions') || button.parentElement;

      if (isAdminUser(currentUser) && actionsWrap && !actionsWrap.querySelector('[data-header-admin]')) {
        const headerAdminBtn = document.createElement('button');
        headerAdminBtn.type = 'button';
        headerAdminBtn.className = 'mini-btn';
        headerAdminBtn.setAttribute('data-header-admin', '');
        headerAdminBtn.textContent = '관리자';
        headerAdminBtn.addEventListener('click', () => { window.location.href = 'admin.html'; });
        actionsWrap.appendChild(headerAdminBtn);
      }

      if (actionsWrap && !actionsWrap.querySelector('[data-header-logout]')) {
        const headerLogoutBtn = document.createElement('button');
        headerLogoutBtn.type = 'button';
        headerLogoutBtn.className = 'mini-btn';
        headerLogoutBtn.setAttribute('data-header-logout', '');
        headerLogoutBtn.textContent = '로그아웃';
        headerLogoutBtn.addEventListener('click', () => signOutAndRedirect('index.html'));
        actionsWrap.appendChild(headerLogoutBtn);
      }
    }
  });

  document.querySelectorAll('a[href="mypage.html"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openAccountEntry();
    });
  });

  document.querySelectorAll('.float-btn[onclick*="login.html"]').forEach((btn) => {
    btn.removeAttribute('onclick');
    btn.addEventListener('click', () => openAccountEntry());
  });

  document.querySelectorAll('a[href^="login.html"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const url = new URL(link.href, window.location.href);
      authRedirectTarget = url.searchParams.get('redirect') || null;
      renderAuthView('login');
    });
  });

  const loginForm = document.querySelector('#loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(loginForm);
      const identifier = String(form.get('identifier') || '').trim();
      const password = String(form.get('password') || '').trim();

      let email = identifier;
      if (!identifier.includes('@')) {
        const { data: foundEmail } = await supabaseClient.rpc('get_email_by_username', { lookup_username: identifier });
        if (!foundEmail) {
          alert('아이디 또는 비밀번호가 올바르지 않습니다.');
          return;
        }
        email = foundEmail;
      }

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        alert('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const redirect = new URLSearchParams(window.location.search).get('redirect') || 'reserve.html';
      window.location.href = redirect;
    });
  }

  const signupForm = document.querySelector('#signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(signupForm);
      const name = String(form.get('name') || '회원').trim();
      const username = String(form.get('username') || '').trim();
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      const phone = String(form.get('phone') || '').trim();

      const { data: existingEmail } = await supabaseClient.rpc('get_email_by_username', { lookup_username: username });
      if (existingEmail) {
        alert('이미 사용 중인 아이디입니다.');
        return;
      }

      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username, name, phone } }
      });

      if (error) {
        alert(error.message.includes('already registered') || error.message.includes('already been registered')
          ? '이미 사용 중인 이메일입니다.'
          : `회원가입 중 오류가 발생했습니다: ${error.message}`);
        return;
      }

      alert('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
      window.location.href = 'login.html';
    });
  }

  const findForm = document.querySelector('#findForm');
  if (findForm) {
    findForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(findForm);
      const email = String(form.get('email') || '').trim();
      const { data: username } = await supabaseClient.rpc('find_username_by_email', { lookup_email: email });
      if (!username) {
        alert('입력하신 이메일로 가입된 회원을 찾을 수 없습니다.');
        return;
      }
      alert(`아이디: ${username}`);
    });
  }

  const pwResetForm = document.querySelector('#pwResetForm');
  if (pwResetForm) {
    const errEl = pwResetForm.querySelector('[data-pr-error]');
    const okEl = pwResetForm.querySelector('[data-pr-ok]');
    pwResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      okEl.hidden = true;
      const btn = pwResetForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      const msg = await resetPasswordWithIdentity({
        email: document.getElementById('pr-email').value.trim(),
        username: document.getElementById('pr-username').value.trim(),
        phone: document.getElementById('pr-phone').value.trim(),
        pw: document.getElementById('pr-pw').value,
        pw2: document.getElementById('pr-pw2').value,
      });
      btn.disabled = false;
      if (msg) { errEl.textContent = msg; errEl.hidden = false; return; }
      okEl.textContent = '비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.';
      okEl.hidden = false;
      pwResetForm.reset();
    });
  }

  // 비밀번호 재설정 페이지: 메일의 링크로 들어오면 임시 세션이 생기고, 그 상태에서 새 비밀번호를 저장
  if (window.location.pathname.endsWith('reset-password.html')) {
    const statusEl = document.querySelector('[data-reset-status]');
    const formEl = document.getElementById('newPasswordForm');
    const errEl = document.querySelector('[data-reset-error]');
    let ready = false;
    const showForm = () => {
      if (ready) return;
      ready = true;
      statusEl.hidden = true;
      formEl.hidden = false;
      document.getElementById('new-password').focus();
    };
    const expiredMsg = '유효하지 않거나 만료된 링크예요. 비밀번호 재설정 링크를 다시 받아 주세요.';
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const tokenHash = params.get('token_hash');

    if (hashParams.get('error') || hashParams.get('error_code')) {
      // 메일 링크가 이미 사용됐거나 만료됨 (메일 보안 검사가 먼저 열어 본 경우 포함)
      statusEl.textContent = expiredMsg;
    } else if (tokenHash) {
      // 메일 링크: ?token_hash=...  → 버튼을 눌러야 확인하므로 메일 자동 검사에 링크가 소모되지 않음
      statusEl.textContent = '아래 버튼을 눌러 비밀번호 재설정을 시작해 주세요.';
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'primary-btn';
      startBtn.style.width = '100%';
      startBtn.textContent = '비밀번호 재설정 시작';
      statusEl.after(startBtn);
      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        const { error } = await supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (error) { startBtn.remove(); statusEl.textContent = expiredMsg; return; }
        startBtn.remove();
        showForm();
      });
    } else {
      supabaseClient.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showForm(); });
      // 링크 해석이 끝난 뒤에도 재설정 세션이 없으면 만료/잘못된 링크
      setTimeout(async () => {
        if (ready) return;
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && /type=recovery/.test(window.location.hash + window.location.search)) { showForm(); return; }
        statusEl.textContent = expiredMsg;
      }, 2500);
    }

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const pw = document.getElementById('new-password').value;
      const pw2 = document.getElementById('new-password2').value;
      const fail = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
      if (pw.length < 6) { fail('비밀번호는 6자 이상이어야 해요.'); return; }
      if (pw !== pw2) { fail('두 비밀번호가 서로 달라요.'); return; }
      const btn = formEl.querySelector('button[type="submit"]');
      btn.disabled = true;
      const { error } = await supabaseClient.auth.updateUser({ password: pw });
      if (error) {
        btn.disabled = false;
        fail(/same|different/i.test(error.message) ? '이전과 다른 비밀번호를 입력해 주세요.' : '비밀번호를 변경하지 못했어요. 링크가 만료됐다면 다시 받아 주세요.');
        return;
      }
      formEl.hidden = true;
      statusEl.hidden = false;
      statusEl.textContent = '비밀번호를 변경했어요. 잠시 후 로그인 화면으로 이동합니다.';
      await supabaseClient.auth.signOut();
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);
    });
  }

  const programTabs = document.querySelectorAll('.program-tab');
  const programSections = document.querySelectorAll('.program-section');
  if (programTabs.length && programSections.length) {
    programTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.program;
        programTabs.forEach((item) => item.classList.toggle('active', item === tab));
        programSections.forEach((section) => {
          section.classList.toggle('active', section.dataset.program === target);
        });
      });
    });
  }

  const initCarousel = (carousel) => {
    if (!carousel) return;
    const track = carousel.querySelector('.program-carousel-track');
    if (!track) return;
    const slides = Array.from(track.children);
    const prevBtn = carousel.querySelector('.hero-nav.left, .hero-arrow.left');
    const nextBtn = carousel.querySelector('.hero-nav.right, .hero-arrow.right');
    let index = 0;

    const updateCarousel = () => {
      const width = carousel.clientWidth;
      track.style.transform = `translateX(-${index * width}px)`;
    };

    prevBtn?.addEventListener('click', () => {
      index = (index - 1 + slides.length) % slides.length;
      updateCarousel();
    });

    nextBtn?.addEventListener('click', () => {
      index = (index + 1) % slides.length;
      updateCarousel();
    });

    window.addEventListener('resize', updateCarousel);
    updateCarousel();
  };

  const SEAT_ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  // 좌석표_A-M열.xlsx 기준: 앞뒤 줄은 양 끝 좌석이 없음
  const SEAT_ROW_RANGES = { A: [3, 22], B: [2, 23], L: [2, 23], M: [3, 22] };

  const buildSeatMap = (container, { getState, onClick }) => {
    const sections = [
      { count: 8, base: 0 },
      { count: 8, base: 8 },
      { count: 8, base: 16 }
    ];

    const applyState = (seat, state) => {
      seat.classList.remove('unavailable', 'selected', 'vip');
      seat.disabled = false;
      const num = seat.dataset.code.match(/\d+$/)[0];
      seat.textContent = num;
      if (state === 'taken') {
        seat.classList.add('unavailable');
        seat.disabled = true;
        seat.textContent = '■';
      } else if (state === 'selected') {
        seat.classList.add('selected');
      } else if (state === 'vip') {
        seat.classList.add('vip');
      }
    };

    container.innerHTML = '';
    SEAT_ROW_LABELS.forEach((rowLabel) => {
      const row = document.createElement('div');
      row.className = 'seat-row';

      const label = document.createElement('span');
      label.className = 'seat-row-label';
      label.textContent = rowLabel;
      row.appendChild(label);

      sections.forEach(({ count, base }, sectionIndex) => {
        if (sectionIndex > 0) {
          const aisle = document.createElement('span');
          aisle.className = 'seat-aisle';
          row.appendChild(aisle);
        }
        const [minSeat, maxSeat] = SEAT_ROW_RANGES[rowLabel] || [1, 24];
        for (let i = 1; i <= count; i += 1) {
          if (base + i < minSeat || base + i > maxSeat) {
            const empty = document.createElement('span');
            empty.className = 'seat';
            empty.style.visibility = 'hidden';
            row.appendChild(empty);
            continue;
          }
          const seatCode = `${rowLabel}${base + i}`;
          const seat = document.createElement('button');
          seat.type = 'button';
          seat.className = 'seat';
          seat.dataset.code = seatCode;
          applyState(seat, getState(seatCode));
          seat.addEventListener('click', () => {
            onClick(seatCode, seat, applyState);
          });
          row.appendChild(seat);
        }
      });
      container.appendChild(row);
    });

    const minimapRoot = container.parentElement?.querySelector('[data-seat-minimap]');
    if (minimapRoot) {
      const rowsWrap = minimapRoot.querySelector('[data-minimap-rows]');
      const viewportBox = minimapRoot.querySelector('[data-minimap-viewport]');
      rowsWrap.innerHTML = SEAT_ROW_LABELS.map(() => '<div class="seat-minimap-row"></div>').join('');

      const updateViewportBox = () => {
        const scrollableWidth = container.scrollWidth - container.clientWidth;
        const scrollRatio = scrollableWidth > 0 ? container.scrollLeft / scrollableWidth : 0;
        const viewportWidthRatio = Math.min(1, container.clientWidth / container.scrollWidth);
        viewportBox.style.width = `${viewportWidthRatio * 100}%`;
        viewportBox.style.left = `${scrollRatio * (1 - viewportWidthRatio) * 100}%`;
      };
      updateViewportBox();
      container.addEventListener('scroll', updateViewportBox);
      window.addEventListener('resize', updateViewportBox);
    }
  };

  document.querySelectorAll('.program-more-slider').forEach((slider) => {
    const track = slider.querySelector('.program-more-track');
    const cards = Array.from(track.children);
    const prevBtn = slider.querySelector('.slider-nav.prev');
    const nextBtn = slider.querySelector('.slider-nav.next');
    let index = 0;

    const getVisibleCount = () => {
      if (window.innerWidth <= 680) return 1;
      if (window.innerWidth <= 980) return 2;
      return 4;
    };

    const updateSlider = () => {
      const cardWidth = cards[0].getBoundingClientRect().width + 18;
      const visibleCount = getVisibleCount();
      const maxIndex = Math.max(0, cards.length - visibleCount);
      index = Math.min(index, maxIndex);
      track.style.transform = `translateX(-${index * cardWidth}px)`;
    };

    prevBtn?.addEventListener('click', () => {
      index = Math.max(0, index - 1);
      updateSlider();
    });

    nextBtn?.addEventListener('click', () => {
      const visibleCount = getVisibleCount();
      const maxIndex = Math.max(0, cards.length - visibleCount);
      index = Math.min(maxIndex, index + 1);
      updateSlider();
    });

    window.addEventListener('resize', updateSlider);
    updateSlider();
  });

  const defaultFilmCatalog = [
    {
      id: 'placeholder',
      category: '4th',
      title: '영화 정보를 불러오지 못했습니다',
      director: '-',
      runtime: '-',
      genre: '-',
      year: '-',
      image: '',
      stills: [''],
      synopsis: '잠시 후 다시 시도해 주세요.',
      directorBio: '',
      credits: []
    }
  ];

  defaultFilmCatalog.forEach((film) => {
    if (!Array.isArray(film.stills) || !film.stills.length) film.stills = [film.image];
  });

  const mapFilmRow = (row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    director: row.director,
    runtime: row.runtime,
    genre: row.genre,
    year: row.year,
    image: row.image,
    stills: Array.isArray(row.stills) && row.stills.length ? row.stills : [row.image],
    synopsis: row.synopsis,
    directorBio: row.director_bio,
    directorPhoto: row.director_photo || '',
    credits: Array.isArray(row.credits) ? row.credits : [],
  });

  const loadFilmCatalog = async () => {
    const { data, error } = await supabaseClient.from('films').select('*').order('created_at', { ascending: true });
    if (error || !data) return defaultFilmCatalog;
    return data.map(mapFilmRow);
  };

  const insertFilm = async (film) => {
    const { error } = await supabaseClient.from('films').insert({
      id: film.id,
      category: film.category,
      title: film.title,
      director: film.director,
      runtime: film.runtime,
      genre: film.genre,
      year: film.year,
      image: film.image,
      stills: film.stills,
      synopsis: film.synopsis,
      director_bio: film.directorBio,
      director_photo: film.directorPhoto || null,
      credits: film.credits,
    });
    return error;
  };

  const updateFilm = async (film) => {
    const { error } = await supabaseClient.from('films').update({
      category: film.category,
      title: film.title,
      director: film.director,
      runtime: film.runtime,
      genre: film.genre,
      year: film.year,
      image: film.image,
      stills: film.stills,
      synopsis: film.synopsis,
      director_bio: film.directorBio,
      director_photo: film.directorPhoto || null,
      credits: film.credits,
    }).eq('id', film.id);
    return error;
  };

  const deleteFilm = async (filmId) => {
    const { error } = await supabaseClient.from('films').delete().eq('id', filmId);
    return error;
  };

  const filmCatalog = await loadFilmCatalog();

  const getFilmById = (filmId) => filmCatalog.find((film) => film.id === filmId) || filmCatalog[0];

  const defaultNoticeCatalog = [
    {
      id: 'opening',
      tag: '공지',
      title: '제3회 매직아워 개막 일정 안내',
      date: '2026.09.01',
      body: [
        '제3회 연세예술원 졸업영화제 《매직아워》가 2026년 12월 4일(금) 오후 4시, 연세대학교 미래캠퍼스 산학관 1층 RIS 대강당에서 개최됩니다.',
        '모든 상영은 무료로 진행되며, 온라인 사전 예매를 통해 좌석을 배정받으실 수 있습니다.',
        '많은 관심과 참여 부탁드립니다.',
      ],
    },
    {
      id: 'booking',
      tag: '',
      title: '온라인 사전 예매 오픈 안내',
      date: '2026.09.10',
      body: [
        '홈페이지 로그인 후 좌석 선택까지 온라인으로 한 번에 진행하실 수 있습니다.',
        '좌석은 선착순으로 배정되며, 예매 인원이 많을 경우 조기 마감될 수 있습니다.',
        '예매 완료 후에는 마이페이지에서 예매 내역을 확인하실 수 있으며, 상영 시작 전까지 취소가 가능합니다.',
        '현장 매표소도 함께 운영되니 참고해 주세요.',
      ],
    },
    {
      id: 'venue',
      tag: '',
      title: '상영관 위치 및 주차 안내',
      date: '2026.09.15',
      body: [
        '상영회장: 연세대학교 미래캠퍼스 산학관 RIS세미나홀',
        '대중교통: 원주시외버스터미널·원주역에서 버스 및 택시 이용이 가능합니다.',
        '자가용: 학교 정문에서 도보 약 2분 거리이며, 주차는 산학관 주차장을 이용해 주시기 바랍니다.',
        '자세한 오시는 길 안내는 관객 가이드 페이지에서 확인하실 수 있습니다.',
      ],
    },
  ];

  const loadNoticeCatalog = async () => {
    const { data, error } = await supabaseClient.from('notices').select('*').order('created_at', { ascending: false });
    if (error || !data) return defaultNoticeCatalog;
    return data.map((row) => ({
      id: row.id, tag: row.tag, title: row.title, date: row.date,
      body: Array.isArray(row.body) ? row.body : [],
    }));
  };

  const insertNotice = async (notice) => {
    const { error } = await supabaseClient.from('notices').insert({
      id: notice.id, tag: notice.tag, title: notice.title, date: notice.date, body: notice.body,
    });
    return error;
  };

  const updateNotice = async (notice) => {
    const { error } = await supabaseClient.from('notices').update({
      tag: notice.tag, title: notice.title, date: notice.date, body: notice.body,
    }).eq('id', notice.id);
    return error;
  };

  const deleteNotice = async (noticeId) => {
    const { error } = await supabaseClient.from('notices').delete().eq('id', noticeId);
    return error;
  };

  const noticeCatalog = await loadNoticeCatalog();

  const defaultSchedule = [
    { id: 'sch-1', category: '기획·장소', date: '2026-09-10', title: '영화제 컨셉·타임테이블 초안 확정', memo: '상영 순서, 총 러닝타임, 오프닝/GV 등 이벤트 구성의 큰 틀 잡기' },
    { id: 'sch-2', category: '기획·장소', date: '2026-09-11', title: '김만수 원장님 컨택', memo: '영화제 관련 원장님 컨택' },
    { id: 'sch-3', category: '기획·장소', date: '2026-09-12', title: '졸업영화제 기획안 제출 마감', memo: '학교·학과에 제출하는 매직아워 영화제 전체 기획안 마무리' },
    { id: 'sch-4', category: '굿즈', date: '2026-09-13', title: '키캡 디자인 초안·기획안 최종', memo: '키캡 굿즈 디자인 초안 및 기획안 확정' },
    { id: 'sch-5', category: '홍보', date: '2026-09-15', title: 'SNS 계정 개설 & 티저 기획', memo: '홍보 채널 오픈, 콘텐츠 캘린더 작성' },
    { id: 'sch-6', category: '후원', date: '2026-09-16', title: '후원사 리스트업 & 제안서 초안', memo: '후원 혜택(로고 노출, 초대권 등) 구성' },
    { id: 'sch-7', category: '기획·장소', date: '2026-09-16', title: 'RIS 대강당 대관 서류·좌석 배치 확정', memo: '연세대 미래캠퍼스 행정실에 정식 사용 승인 요청, 좌석 수·스크린·음향 사양 확인' },
    { id: 'sch-8', category: '굿즈', date: '2026-09-18', title: '텀블벅 최종', memo: '텀블벅 펀딩 페이지 최종 확정' },
    { id: 'sch-9', category: '기획·장소', date: '2026-09-18', title: '참가작 기획안 제출 마감', memo: '각 팀(작품)별 시놉시스·기획안을 프로그램팀에 제출' },
    { id: 'sch-10', category: '후원', date: '2026-09-19', title: '후원 기획안(제안서) 작성 마감', memo: '후원 혜택·금액 구성이 담긴 제안서 문서 최종화' },
    { id: 'sch-11', category: '홍보', date: '2026-09-20', title: '메인 포스터 디자인 최종 확정', memo: '매직아워 컨셉 이미지 확정 후 인쇄·홍보용 파일 추출' },
    { id: 'sch-12', category: '후원', date: '2026-09-22', title: '모월 대표님', memo: '모월 대표님 미팅' },
    { id: 'sch-13', category: '후원', date: '2026-09-22', title: '후원 제안서 발송 시작', memo: '잠재 후원사에 이메일·미팅 요청' },
    { id: 'sch-14', category: '굿즈', date: '2026-09-24', title: '굿즈 아이템·예산 확정', memo: '뱃지, 포스터, 엽서 등 품목·수량·단가 확정' },
    { id: 'sch-15', category: '기획·장소', date: '2026-09-25', title: '상영작 최종 라인업 확정', memo: '상영 순서와 총 상영 시간 확정, 자막본 요청' },
    { id: 'sch-16', category: '기획·장소', date: '2026-09-28', endDate: '2026-10-05', title: '연세아트위크', memo: '연세아트위크 기간' },
    { id: 'sch-17', category: '굿즈', date: '2026-09-28', title: '굿즈 디자인 시안 작업 시작', memo: '포스터 컨셉과 통일감 있는 시안 2~3안 제작' },
    { id: 'sch-18', category: '홍보', date: '2026-09-30', title: '티저 영상 공개', memo: '예고편 또는 하이라이트 클립 SNS 배포' },
    { id: 'sch-19', category: '후원', date: '2026-10-10', title: '후원 신청 마감일', memo: '후원 확정 여부 최종 회신 마감' },
    { id: 'sch-20', category: '굿즈', date: '2026-10-12', title: '굿즈 인쇄 발주', memo: '제작 기간 최소 2주 확보하고 발주' },
    { id: 'sch-21', category: '운영·제작', date: '2026-10-15', title: '프로그램북 콘텐츠 취합 시작', memo: '작품 소개, 감독 인터뷰, 스태프 크레딧 정리' },
    { id: 'sch-22', category: '기획·장소', date: '2026-10-16', endDate: '2026-10-18', title: '통영영화제', memo: '통영영화제 기간' },
    { id: 'sch-23', category: '홍보', date: '2026-10-18', title: '온라인 티켓팅 오픈', memo: '예매 링크 오픈 및 좌석 안내 공지' },
    { id: 'sch-24', category: '굿즈', date: '2026-10-05', title: '굿즈 디자인 최종 확정', memo: '인쇄소 전달용 최종 파일(도련 포함) 완성' },
    { id: 'sch-25', category: '운영·제작', date: '2026-10-22', title: '프로그램북 디자인 확정·인쇄 발주', memo: '굿즈와 함께 인쇄 일정 맞추기' },
    { id: 'sch-26', category: '후원', date: '2026-10-25', title: '후원 물품·금액 최종 수령', memo: '감사 크레딧(포스터·프로그램북 로고) 반영' },
    { id: 'sch-27', category: '기획·장소', date: '2026-10-26', title: 'MC 지원 시작', memo: '사회자(MC) 지원 접수 시작' },
    { id: 'sch-28', category: '기획·장소', date: '2026-10-26', endDate: '2026-10-30', title: '디플로마 캠프', memo: '디플로마 캠프 기간' },
    { id: 'sch-29', category: '굿즈', date: '2026-10-28', title: '굿즈 인쇄물 수령·검수', memo: '수량, 색상, 인쇄 품질 확인' },
    { id: 'sch-30', category: '운영·제작', date: '2026-11-01', title: '상영본 1차 점검', memo: '파일 포맷, 자막, 음량 레벨 확인' },
    { id: 'sch-31', category: '기획·장소', date: '2026-11-02', title: 'MC 최종 확정', memo: '사회자(MC) 최종 확정' },
    { id: 'sch-32', category: '홍보', date: '2026-11-03', title: '티저 최종 컨펌', memo: '티저 영상 최종 컨펌' },
    { id: 'sch-33', category: '홍보', date: '2026-11-04', title: '티저 업로드', memo: '확정된 티저 영상 SNS 업로드' },
    { id: 'sch-34', category: '기획·장소', date: '2026-11-04', title: 'RIS 대강당 사용 가능 시작일', memo: 'RIS 대강당을 실제로 사용할 수 있는 첫 날짜' },
    { id: 'sch-35', category: '기획·장소', date: '2026-11-05', title: '스태프 역할 분담 최종 회의', memo: '현장 진행·안내·기록 등 담당자 배정' },
    { id: 'sch-36', category: '운영·제작', date: '2026-11-08', title: '상영 장비 대여·테스트', memo: '빔프로젝터, 스피커, 마이크 사전 점검' },
    { id: 'sch-37', category: '기획·장소', date: '2026-11-15', title: '현장 세팅 리허설(RIS 대강당 답사)', memo: '동선, 좌석 배치, 굿즈 부스 위치 점검' },
    { id: 'sch-38', category: '홍보', date: '2026-11-16', title: '영화제 포스터 홍보', memo: '확정 포스터로 온·오프라인 홍보 진행' },
    { id: 'sch-39', category: '홍보', date: '2026-11-20', title: '최종 홍보 스퍼트', memo: 'D-2주 카운트다운 콘텐츠, 커뮤니티 공유 요청' },
    { id: 'sch-40', category: '운영·제작', date: '2026-11-22', title: '최종 상영본 점검 완료', memo: '장소에서 실제 재생 테스트' },
    { id: 'sch-41', category: '운영·제작', date: '2026-11-23', title: 'MC 대본·PPT 마감', memo: '사회자 대본과 진행 PPT 최종 마감' },
    { id: 'sch-42', category: '운영·제작', date: '2026-11-23', title: '영상 최종마감', memo: '상영·홍보 영상 최종 마감' },
    { id: 'sch-43', category: '기획·장소', date: '2026-12-01', title: '최종상영작 마감', memo: '참가작 최종 상영본 제출 마감' },
    { id: 'sch-44', category: '운영·제작', date: '2026-12-01', title: '물품·굿즈 현장 반입', memo: '부스 세팅, 재고 정리' },
    { id: 'sch-45', category: '운영·제작', date: '2026-12-03', title: '전체 리허설·최종 브리핑', memo: '큐시트 기준 리허설, 스태프 최종 안내' },
    { id: 'sch-46', category: '운영·제작', date: '2026-12-04', title: '매직아워 영화제 D-DAY', memo: '상영 및 행사 진행' },
    { id: 'sch-47', category: '운영·제작', date: '2026-12-07', title: '후원사 감사 인사·정산', memo: '감사 메일 발송, 예산 정산' },
    { id: 'sch-48', category: '운영·제작', date: '2026-12-09', title: '행사 피드백 수합·아카이빙', memo: '설문 취합, 사진·영상 아카이브 정리' },
  ];

  const loadSchedule = async () => {
    const { data, error } = await supabaseClient.from('schedule').select('*').order('date', { ascending: true });
    if (error || !data) return defaultSchedule;
    return data.map((row) => ({
      id: row.id, category: row.category, date: row.date, endDate: row.end_date || '',
      title: row.title, memo: row.memo || '', createdByName: row.created_by_name || '',
    }));
  };

  const insertScheduleItem = async (item) => {
    const { error } = await supabaseClient.from('schedule').insert({
      id: item.id, category: item.category, date: item.date, end_date: item.endDate || null,
      title: item.title, memo: item.memo, created_by_name: item.createdByName || null,
    });
    return error;
  };

  const updateScheduleItem = async (item) => {
    const { error } = await supabaseClient.from('schedule').update({
      category: item.category, date: item.date, end_date: item.endDate || null,
      title: item.title, memo: item.memo,
    }).eq('id', item.id);
    return error;
  };

  const deleteScheduleItem = async (itemId) => {
    const { error } = await supabaseClient.from('schedule').delete().eq('id', itemId);
    return error;
  };

  const loadSponsors = async () => {
    const { data, error } = await supabaseClient.from('sponsors').select('*').order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id, name: row.name, type: row.type, amount: row.amount,
      status: row.status, contact: row.contact, memo: row.memo,
    }));
  };

  const insertSponsor = async (sponsor) => {
    const { error } = await supabaseClient.from('sponsors').insert({
      id: sponsor.id, name: sponsor.name, type: sponsor.type, amount: sponsor.amount,
      status: sponsor.status, contact: sponsor.contact, memo: sponsor.memo,
    });
    return error;
  };

  const updateSponsor = async (sponsor) => {
    const { error } = await supabaseClient.from('sponsors').update({
      name: sponsor.name, type: sponsor.type, amount: sponsor.amount,
      status: sponsor.status, contact: sponsor.contact, memo: sponsor.memo,
    }).eq('id', sponsor.id);
    return error;
  };

  const deleteSponsor = async (sponsorId) => {
    const { error } = await supabaseClient.from('sponsors').delete().eq('id', sponsorId);
    return error;
  };

  const loadSettlement = async () => {
    const { data, error } = await supabaseClient.from('settlement').select('*').order('created_at', { ascending: true });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id, date: row.date, type: row.type, category: row.category,
      item: row.item, amount: row.amount,
    }));
  };

  const insertSettlementItem = async (item) => {
    const { error } = await supabaseClient.from('settlement').insert({
      id: item.id, date: item.date, type: item.type, category: item.category,
      item: item.item, amount: item.amount,
    });
    return error;
  };

  const updateSettlementItem = async (item) => {
    const { error } = await supabaseClient.from('settlement').update({
      date: item.date, type: item.type, category: item.category,
      item: item.item, amount: item.amount,
    }).eq('id', item.id);
    return error;
  };

  const deleteSettlementItem = async (itemId) => {
    const { error } = await supabaseClient.from('settlement').delete().eq('id', itemId);
    return error;
  };

  if (window.location.pathname.endsWith('film-detail.html')) {
    const filmId = new URLSearchParams(window.location.search).get('film') || '4th-yeongeopilji';
    const film = getFilmById(filmId);
    const hero = document.getElementById('film-hero');
    const titleEl = document.getElementById('film-title');
    const subtitleEl = document.getElementById('film-subtitle');
    const metaLineEl = document.getElementById('film-meta-line');
    const synopsisEl = document.getElementById('film-synopsis');
    const directorPhotoEl = document.getElementById('film-director-photo');
    const directorNameEl = document.getElementById('film-director-name');
    const directorTextEl = document.getElementById('film-director-text');
    const creditGridEl = document.getElementById('film-credit-grid');
    const relatedTrackEl = document.getElementById('related-slider-track');
    const subnavEl = document.getElementById('film-detail-subnav');

    if (subnavEl) {
      subnavEl.querySelectorAll('.program-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.program === film.category);
      });
    }

    if (hero) {
      const stills = film.stills && film.stills.length ? film.stills : [film.image];
      hero.innerHTML = `
        <div class="program-carousel-track">
          ${stills.map((src) => `<div class="program-slide" style="background-image:linear-gradient(180deg, rgba(7,10,18,0.18), rgba(7,10,18,0.28)), url('${src}')"></div>`).join('')}
        </div>
        <button class="hero-arrow left" type="button" aria-label="이전 사진">‹</button>
        <button class="hero-arrow right" type="button" aria-label="다음 사진">›</button>
        <div class="hero-side-actions" aria-label="영화 액션 버튼">
          <button type="button">♡</button>
          <button type="button">✦</button>
          <button type="button">↗</button>
        </div>
      `;
      initCarousel(hero);
    }
    if (titleEl) titleEl.textContent = film.title;
    if (subtitleEl) subtitleEl.textContent = `${film.director}`;
    if (metaLineEl) {
      metaLineEl.innerHTML = [film.genre, film.runtime, film.year, film.category.toUpperCase()].map((item) => `<span>${item}</span>`).join('');
    }
    if (synopsisEl) synopsisEl.textContent = film.synopsis;
    if (directorPhotoEl) {
      directorPhotoEl.style.backgroundImage = `linear-gradient(135deg, rgba(16,34,69,0.08), rgba(16,34,69,0.18)), url('${film.directorPhoto || film.image}')`;
    }
    if (directorNameEl) directorNameEl.textContent = film.director;
    if (directorTextEl) directorTextEl.textContent = film.directorBio;
    if (creditGridEl) {
      creditGridEl.innerHTML = film.credits.map((credit) => `
        <div class="credit-col">
          <div class="credit-item"><span>${credit.split(':')[0]}</span><strong>${credit.split(':').slice(1).join(':').trim()}</strong></div>
        </div>
      `).join('');
    }
    if (relatedTrackEl) {
      const related = filmCatalog.filter((item) => item.id !== film.id);
      relatedTrackEl.innerHTML = [...related, ...related].map((item) => `
        <a class="program-film-card" href="film-detail.html?film=${item.id}">
          <div class="program-film-image" style="background-image:url('${item.image}')"></div>
          <div class="program-film-info">
            <strong>${item.title}</strong>
            <span>${item.director}</span>
          </div>
        </a>
      `).join('');
    }
  }

  document.querySelectorAll('[data-film-grid]').forEach((grid) => {
    const category = grid.dataset.filmGrid;
    const films = filmCatalog.filter((item) => item.category === category);
    grid.innerHTML = films.map((item) => `
      <a class="grad-film-card" href="film-detail.html?film=${item.id}">
        <div class="grad-film-image" style="background-image:url('${item.image}')"></div>
        <div class="grad-film-copy">
          <h3>${item.title}</h3>
          <p>${item.director}</p>
          <div class="grad-film-meta">${item.year} · ${item.runtime} · ${item.genre}</div>
        </div>
      </a>
    `).join('');
    const header = grid.parentElement?.querySelector('.grad-gallery-header span');
    if (header) header.textContent = `${films.length}편의 상영작`;
  });

  const program4thTitleEl = document.getElementById('program-4th-title');
  if (program4thTitleEl) {
    const film = filmCatalog.find((item) => item.id === 'metro-ipsu-makina') || filmCatalog[0];
    const trackEl = document.getElementById('program-4th-track');
    if (trackEl) {
      const stills = film.stills && film.stills.length ? film.stills : [film.image];
      trackEl.innerHTML = stills.map((src, i) => `<div class="program-slide"><img src="${src}" alt="${film.title} 스틸컷 ${i + 1}" /></div>`).join('');
      initCarousel(document.getElementById('program-4th-carousel'));
    }
    program4thTitleEl.textContent = film.title;
    const metaEl = document.getElementById('program-4th-meta');
    if (metaEl) {
      metaEl.innerHTML = `<span>장르 · ${film.genre}</span><span>러닝타임 · ${film.runtime}</span><span>감독 · ${film.director}</span>`;
    }
    const synopsisEl = document.getElementById('program-4th-synopsis');
    if (synopsisEl) synopsisEl.textContent = film.synopsis;
    const directorNameEl = document.getElementById('program-4th-director-name');
    if (directorNameEl) directorNameEl.textContent = film.director;
    const directorBioEl = document.getElementById('program-4th-director-bio');
    if (directorBioEl) directorBioEl.textContent = film.directorBio;
    const directorImgEl = document.getElementById('program-4th-director-img');
    if (directorImgEl) directorImgEl.src = film.image;
    const creditsEl = document.getElementById('program-4th-credits');
    if (creditsEl) {
      creditsEl.innerHTML = film.credits.map((credit) => `
        <div class="credit-col">
          <div class="credit-item"><span>${credit.split(':')[0]}</span><strong>${credit.split(':').slice(1).join(':').trim()}</strong></div>
        </div>
      `).join('');
    }
  }

  const renderOtherFilmsSlider = (trackEl, excludeCategory) => {
    if (!trackEl) return;
    const others = filmCatalog.filter((item) => item.category !== excludeCategory);
    if (!others.length) return;
    const doubled = [...others, ...others];
    trackEl.innerHTML = doubled.map((item) => `
      <a class="program-film-card" href="film-detail.html?film=${item.id}">
        <div class="program-film-image" style="background-image:url('${item.image}')"></div>
        <div class="program-film-info">
          <strong>${item.title}</strong>
          <span>${item.director}</span>
        </div>
      </a>
    `).join('');
  };

  renderOtherFilmsSlider(document.getElementById('program-4th-other-track'), '4th');

  const homeProgramGrid = document.getElementById('home-program-grid');
  if (homeProgramGrid) {
    const categoryLabels = { '4th': '4기 단편영화', grad: '정경대학원 영화', '3rd': '3기 졸업영화' };
    homeProgramGrid.innerHTML = filmCatalog.map((item) => `
      <a class="home-program-card" href="film-detail.html?film=${item.id}">
        <div class="home-program-thumb" style="background-image:url('${item.image}')"></div>
        <span class="home-program-cat">${categoryLabels[item.category] || ''}</span>
        <div class="home-program-title">${item.title}</div>
      </a>
    `).join('');

    const homeProgramCarousel = homeProgramGrid.closest('.home-program-carousel');
    if (homeProgramCarousel) {
      let page = 0;
      let maxPage = 0;

      const updateHomeProgramSlider = () => {
        const cards = Array.from(homeProgramGrid.children);
        if (!cards.length) return;
        const cardRect = cards[0].getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(homeProgramGrid).gap) || 0;
        const viewportWidth = homeProgramCarousel.querySelector('.home-program-viewport').clientWidth;
        const visibleCount = Math.max(1, Math.round((viewportWidth + gap) / (cardRect.width + gap)));
        maxPage = Math.max(0, cards.length - visibleCount);
        page = Math.min(page, maxPage);
        const offset = page * (cardRect.width + gap);
        homeProgramGrid.style.transform = `translateX(-${offset}px)`;
      };

      const advanceHomeProgramSlide = () => {
        page = page >= maxPage ? 0 : page + 1;
        updateHomeProgramSlider();
      };

      const AUTOPLAY_INTERVAL_MS = 2000;
      let autoplayTimer = window.setInterval(advanceHomeProgramSlide, AUTOPLAY_INTERVAL_MS);
      homeProgramCarousel.addEventListener('mouseenter', () => window.clearInterval(autoplayTimer));
      homeProgramCarousel.addEventListener('mouseleave', () => {
        autoplayTimer = window.setInterval(advanceHomeProgramSlide, AUTOPLAY_INTERVAL_MS);
      });

      window.addEventListener('resize', updateHomeProgramSlider);
      updateHomeProgramSlider();
    }
  }

  const subTabs = document.querySelectorAll('.sub-tab');
  const subTabPanels = document.querySelectorAll('[data-subtab-panel]');
  if (subTabs.length && subTabPanels.length) {
    subTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.subtab;
        subTabs.forEach((item) => item.classList.toggle('active', item === tab));
        subTabPanels.forEach((panel) => {
          panel.hidden = panel.dataset.subtabPanel !== target;
        });
      });
    });
  }

  const posterMainImg = document.getElementById('poster-main-img');
  const posterThumbs = document.querySelectorAll('.poster-thumb');
  if (posterMainImg && posterThumbs.length) {
    posterThumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        posterMainImg.src = thumb.dataset.posterSrc;
        posterThumbs.forEach((item) => item.classList.toggle('active', item === thumb));
      });
    });
  }

  const awardDetails = {
    turtle: {
      poster: '거북이.jpeg',
      badge: '제1회 대전국제꿈씨영화제 수상',
      title: '단편영화 「거북이」',
      director: '최현민 감독',
      synopsis:
        '오랜만에 고향 집을 찾은 손자가 마당에서 발견한 거북이 한 마리를 사이에 두고 할머니와 나누는 짧은 대화. 말수 적은 두 사람이 조용히 가까워지는 순간을 담은 가족 드라마입니다.',
    },
    limsi: {
      poster: '림시교원.webp',
      badge: '제20회 키프로스 국제영화제(CYIFF) 3관왕 — 최우수 장편영화상 · 여우주연상 · 남우조연상',
      title: '장편영화 「림시교원」 (PORTRAIT)',
      director: '석범진 감독',
      synopsis:
        '북으로 간 남한 교생의 이야기. 경계를 넘나든 한 사람의 삶을 마주한 두 여성의 시선이 교차하며, 신념과 그리움 사이에서 흔들리는 얼굴들을 담아낸 장편영화입니다.',
    },
    zero: {
      poster: '제로.webp',
      badge: 'GMAFF(Global Metaverse AI Film Festival) 대상 · AI International Film Festival 4관왕',
      title: '단편영화 「ZERO」',
      director: '오동하 감독',
      sections: [
        {
          title: '1. Happy and Brave New World',
          body: '「제로」는 \'아직까지는\' 인간이 철저하게 인공지능을 통제하고 있는 세계관을 다루고 있다. 그렇기에 우리는 \'해피\'하고 \'브레이브\'해질 수 있다. 이 얼마나 아름다운 세상인가?',
        },
        {
          title: '2. 장 작가, 아나운서, 방청객, 택시기사, 베라',
          body: '각 캐릭터는 인공지능을 받아들이는 인류의 다양한 모습을 상징한다. 당신은 이들 중에 어떤 부류의 사람인가?',
        },
        {
          title: '3. 차의 의미',
          body: '당신은 \'인공지능\'이라는 뜨거운 차를 마실 준비가 되어 있는가? 시도조차 해보지 않을 것인가? 차는 언젠가 식을 것이고, 목이 말라지면 마실 수밖에 없는 상황에 놓일 것이다.',
        },
        {
          title: '4. 나르시스',
          body: '문장 성분의 상당 부분이 자신의 책에서 온 것을 눈치채지 못하고 결단을 내린 장 작가는 우물에 비친 자신의 아름다운 모습에 현혹되어 죽은 나르시스와 같다.',
        },
        {
          title: '5. 세 개의 팔',
          body: '마지막 장면의 프롬프트는 \'우아한 춤을 추는 베라\'였다. 인공지능은 3개의 기괴한 팔을 연출했다. 3개의 팔로 추는 춤이 더 우아하다고 할 수 있을까? AI가 가진 불완전성을 적나라하게 노출하고 싶었다. 이세돌이 알파고에게 한 번 이겼듯, 지금이 인간 연출자가 AI를 이길 수 있는 마지막 기회일지도 모른다.',
        },
      ],
      credits: [
        ['감독', '오동하'],
        ['프로듀서', '윤종호'],
        ['출연', '이상희, 홍승희, 박지홍'],
        ['프롬프트 아티스트', '송주현, 주상림, 송은미, 정재훈'],
        ['촬영', '박진영'],
        ['사운드 믹싱', '황종연'],
      ],
    },
  };

  const awardModalOverlay = document.getElementById('award-modal-overlay');
  if (awardModalOverlay) {
    const awardModalImg = document.getElementById('award-modal-img');
    const awardModalBadge = document.getElementById('award-modal-badge');
    const awardModalTitle = document.getElementById('award-modal-title');
    const awardModalDirector = document.getElementById('award-modal-director');
    const awardModalSynopsis = document.getElementById('award-modal-synopsis');
    const awardModalSections = document.getElementById('award-modal-sections');
    const awardModalCredits = document.getElementById('award-modal-credits');
    const awardModalClose = document.getElementById('award-modal-close');

    const openAwardModal = (key) => {
      const data = awardDetails[key];
      if (!data) return;
      awardModalImg.src = data.poster;
      awardModalImg.alt = data.title;
      awardModalBadge.textContent = data.badge;
      awardModalTitle.textContent = data.title;
      awardModalDirector.textContent = data.director;

      if (data.sections && data.sections.length) {
        awardModalSynopsis.hidden = true;
        awardModalSynopsis.textContent = '';
        awardModalSections.innerHTML = '';
        data.sections.forEach(({ title, body }) => {
          const section = document.createElement('div');
          section.className = 'award-modal-section';
          const h4 = document.createElement('h4');
          h4.textContent = title;
          const p = document.createElement('p');
          p.textContent = body;
          section.appendChild(h4);
          section.appendChild(p);
          awardModalSections.appendChild(section);
        });
        awardModalSections.hidden = false;
      } else {
        awardModalSections.hidden = true;
        awardModalSections.innerHTML = '';
        awardModalSynopsis.hidden = false;
        awardModalSynopsis.textContent = data.synopsis || '';
      }

      awardModalCredits.innerHTML = '';
      if (data.credits && data.credits.length) {
        data.credits.forEach(([label, value]) => {
          const row = document.createElement('div');
          row.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
          awardModalCredits.appendChild(row);
        });
        awardModalCredits.hidden = false;
      } else {
        awardModalCredits.hidden = true;
      }
      awardModalOverlay.hidden = false;
    };

    const closeAwardModal = () => {
      awardModalOverlay.hidden = true;
    };

    document.querySelectorAll('.award-card[data-award]').forEach((card) => {
      card.addEventListener('click', () => openAwardModal(card.dataset.award));
    });

    if (awardModalClose) awardModalClose.addEventListener('click', closeAwardModal);
    awardModalOverlay.addEventListener('click', (e) => {
      if (e.target === awardModalOverlay) closeAwardModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !awardModalOverlay.hidden) closeAwardModal();
    });
  }

  const noticeListContainer = document.querySelector('.notice-list');
  if (noticeListContainer) {
    const notices = noticeCatalog;

    noticeListContainer.innerHTML = notices.map((notice) => `
      <button type="button" class="notice-row" data-notice="${notice.id}">
        ${notice.tag ? `<span class="notice-tag">${notice.tag}</span>` : ''}
        <span class="notice-row-title">${notice.title}</span>
        <span class="notice-row-date">${notice.date}</span>
      </button>
    `).join('') || '<p class="admin-hint">등록된 공지가 없습니다.</p>';

    const listView = document.querySelector('[data-notice-view="list"]');
    const detailView = document.querySelector('[data-notice-view="detail"]');
    const detailTitle = document.getElementById('notice-detail-title');
    const detailDate = document.getElementById('notice-detail-date');
    const detailBody = document.getElementById('notice-detail-body');
    const backBtn = document.getElementById('notice-back-btn');

    noticeListContainer.querySelectorAll('.notice-row').forEach((row) => {
      row.addEventListener('click', () => {
        const data = notices.find((n) => n.id === row.dataset.notice);
        if (!data) return;
        detailTitle.textContent = data.title;
        detailDate.textContent = data.date + " · 작성자 집행위원장 김창기";
        detailBody.innerHTML = data.body.map((line) => `<p>${line}</p>`).join('');
        listView.hidden = true;
        detailView.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    backBtn?.addEventListener('click', () => {
      detailView.hidden = true;
      listView.hidden = false;
    });
  }

  const copyEmailButtons = document.querySelectorAll('[data-copy-email]');
  if (copyEmailButtons.length) {
    let copyToast = document.querySelector('.copy-toast');
    if (!copyToast) {
      copyToast = document.createElement('div');
      copyToast.className = 'copy-toast';
      document.body.appendChild(copyToast);
    }

    let toastTimer = null;
    const showCopyToast = (message) => {
      copyToast.textContent = message;
      copyToast.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        copyToast.classList.remove('show');
      }, 2200);
    };

    const fallbackCopy = (text) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        /* noop */
      }
      document.body.removeChild(textarea);
    };

    copyEmailButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.copyEmail;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(email);
          } else {
            fallbackCopy(email);
          }
        } catch (err) {
          fallbackCopy(email);
        }
        showCopyToast(`${email} 이메일 주소가 복사되었습니다.`);
      });
    });
  }

  const cheerSubmitBtn = document.getElementById('cheer-submit-btn');
  if (cheerSubmitBtn) {
    const cheerNameInput = document.getElementById('cheer-name');
    const cheerMessageInput = document.getElementById('cheer-message');
    const cheerMessageList = document.getElementById('cheer-message-list');

    const cheerUser = currentUser;
    if (cheerUser && cheerNameInput) {
      cheerNameInput.value = cheerUser.name || cheerUser.username || '';
    }

    const loadCheerMessages = async () => {
      const { data, error } = await supabaseClient.from('cheer_messages').select('*').order('created_at', { ascending: true });
      if (error || !data) return [];
      return data;
    };

    const insertCheerMessage = async (name, message) => {
      const { data, error } = await supabaseClient.from('cheer_messages').insert({
        user_id: cheerUser.id, name, message,
      }).select().single();
      return { data, error };
    };

    const deleteCheerMessage = async (id) => {
      const { error } = await supabaseClient.from('cheer_messages').delete().eq('id', id);
      return error;
    };

    const canDeleteCheer = (msg) => {
      if (!cheerUser) return false;
      if (cheerUser.is_super_admin) return true;
      return cheerUser.id === msg.user_id;
    };

    const cheerMessages = await loadCheerMessages();

    const renderCheerMessages = () => {
      cheerMessageList.innerHTML = '';
      if (!cheerMessages.length) {
        const empty = document.createElement('p');
        empty.className = 'cheer-empty';
        empty.textContent = '아직 등록된 응원 메시지가 없습니다. 첫 번째 응원을 남겨보세요!';
        cheerMessageList.appendChild(empty);
        return;
      }
      cheerMessages
        .slice()
        .reverse()
        .forEach((msg) => {
          const item = document.createElement('div');
          item.className = 'cheer-message-item';

          const row = document.createElement('div');
          row.className = 'cheer-msg-row';

          const nameEl = document.createElement('div');
          nameEl.className = 'cheer-msg-name';
          nameEl.textContent = msg.name;
          row.appendChild(nameEl);

          if (canDeleteCheer(msg)) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'cheer-msg-delete';
            deleteBtn.textContent = '삭제';
            deleteBtn.addEventListener('click', async () => {
              if (!confirm('이 응원 메시지를 삭제할까요?')) return;
              const error = await deleteCheerMessage(msg.id);
              if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
              const index = cheerMessages.findIndex((m) => m.id === msg.id);
              if (index !== -1) cheerMessages.splice(index, 1);
              renderCheerMessages();
            });
            row.appendChild(deleteBtn);
          }

          const textEl = document.createElement('div');
          textEl.className = 'cheer-msg-text';
          textEl.textContent = msg.message;

          item.appendChild(row);
          item.appendChild(textEl);
          cheerMessageList.appendChild(item);
        });
    };

    renderCheerMessages();

    cheerSubmitBtn.addEventListener('click', async () => {
      if (!cheerUser) {
        window.requireLoginThen('community-cheer.html');
        return;
      }
      const name = cheerNameInput.value.trim();
      const message = cheerMessageInput.value.trim();
      if (!name || !message) {
        alert('응원 메시지를 입력해주세요.');
        return;
      }
      const { data: newMsg, error } = await insertCheerMessage(name, message);
      if (error) { window.alert('등록 중 오류가 발생했습니다: ' + error.message); return; }
      cheerMessages.push(newMsg);
      cheerMessageInput.value = '';
      renderCheerMessages();
    });
  }

  const filmCards = document.querySelectorAll('.film-card');
  if (filmCards.length) {
    const modal = document.createElement('div');
    modal.className = 'film-modal';
    modal.innerHTML = `
      <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="film-modal-title">
        <div class="modal-header">
          <h3>작품 소개</h3>
          <button class="modal-close" type="button" aria-label="닫기">×</button>
        </div>
        <div class="modal-body">
          <div class="modal-poster" id="film-poster"></div>
          <div class="modal-content">
            <h4 id="film-modal-title">제목</h4>
            <div class="modal-meta" id="film-modal-meta"></div>
            <p id="film-modal-synopsis"></p>
            <div class="modal-block">
              <h5>감독 소개</h5>
              <p id="film-modal-director"></p>
            </div>
            <div class="modal-block">
              <h5>크레딧</h5>
              <ul id="film-modal-credits"></ul>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const posterEl = modal.querySelector('#film-poster');
    const titleEl = modal.querySelector('#film-modal-title');
    const metaEl = modal.querySelector('#film-modal-meta');
    const synopsisEl = modal.querySelector('#film-modal-synopsis');
    const directorEl = modal.querySelector('#film-modal-director');
    const creditsEl = modal.querySelector('#film-modal-credits');
    const closeBtn = modal.querySelector('.modal-close');

    function openFilmModal(id) {
      const film = getFilmById(id);
      if (!film) return;
      posterEl.style.backgroundImage = `url('${film.image}')`;
      titleEl.textContent = film.title;
      metaEl.innerHTML = [film.genre, film.runtime, film.director].map((item) => `<span>${item}</span>`).join('');
      synopsisEl.textContent = film.synopsis;
      directorEl.textContent = film.directorBio;
      creditsEl.innerHTML = film.credits.map((credit) => `<li>${credit}</li>`).join('');
      modal.classList.add('visible');
    }

    function closeFilmModal() {
      modal.classList.remove('visible');
    }

    filmCards.forEach((card) => {
      card.addEventListener('click', () => {
        openFilmModal(card.dataset.filmId);
      });
    });

    closeBtn.addEventListener('click', closeFilmModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeFilmModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFilmModal();
    });
  }

  if (window.location.pathname.endsWith('mypage.html')) {
    if (!currentUser) {
      window.location.href = 'login.html';
      return;
    }

    const nameEl = document.querySelector('[data-mypage-name]');
    const emailEl = document.querySelector('[data-mypage-email]');
    const bookingList = document.querySelector('[data-booking-list]');
    const logoutBtn = document.querySelector('[data-logout]');

    if (nameEl) nameEl.textContent = currentUser.name || currentUser.username;
    if (emailEl) emailEl.textContent = currentUser.email || '—';

    if (bookingList) {
      const { data: userBookings } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!userBookings || !userBookings.length) {
        bookingList.innerHTML = bookingEmptyHTML;
      } else {
        bookingList.innerHTML = userBookings.map((b) => bookingCardHTML(b, 'data-cancel-booking')).join('');

        bookingList.querySelectorAll('[data-cancel-booking]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!window.confirm('예매를 취소하시겠어요?')) return;
            const bookingId = btn.getAttribute('data-cancel-booking');
            await supabaseClient.from('bookings').delete().eq('id', bookingId);
            window.location.reload();
          });
        });
      }
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => signOutAndRedirect('index.html'));
    }
  }

  const ADMIN_PAGES = ['admin.html', 'admin-vip.html', 'admin-films.html', 'admin-members.html', 'admin-notices.html', 'admin-schedule.html', 'admin-sponsors.html', 'admin-settlement.html'];
  const currentAdminPage = ADMIN_PAGES.find((page) => window.location.pathname.endsWith(page));

  if (currentAdminPage) {
    if (!isAdminUser(currentUser)) {
      window.location.href = `login.html?redirect=${currentAdminPage}`;
      return;
    }
    var isSuperAdmin = !!currentUser.is_super_admin;

    const SUPER_ADMIN_ONLY_PAGES = ['admin-members.html', 'admin-films.html', 'admin-notices.html'];
    if (SUPER_ADMIN_ONLY_PAGES.includes(currentAdminPage) && !isSuperAdmin) {
      window.location.href = 'admin.html';
      return;
    }

    if (!isSuperAdmin) {
      ['members', 'films', 'notices'].forEach((tab) => {
        const tabEl = document.querySelector(`[data-admin-tab="${tab}"]`);
        if (tabEl) tabEl.style.display = 'none';
      });
    }

    const logoutBtn = document.querySelector('[data-logout]');
    logoutBtn?.addEventListener('click', () => signOutAndRedirect('index.html'));
  }

  if (currentAdminPage === 'admin.html' || currentAdminPage === 'admin-vip.html') {
    const adminList = document.querySelector('[data-admin-bookings]');
    if (adminList) {
      const searchEl = document.querySelector('[data-booking-search]');
      const statsEl = document.querySelector('[data-booking-stats]');
      const esc = (v) => String(v ?? '-').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const codeOf = (b) => `MH-${String(b.id).padStart(4, '0')}`;
      const timeOf = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

      const { data: loaded } = await supabaseClient
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      const allBookings = loaded || [];

      const renderBookings = () => {
        const q = (searchEl?.value || '').trim().toLowerCase();
        const rows = allBookings.filter((b) => !q || [codeOf(b), b.name, b.phone, (b.seats || []).join(' ')]
          .join(' ').toLowerCase().includes(q));
        const people = allBookings.reduce((n, b) => n + (b.seats || []).length, 0);
        const inPeople = allBookings.filter((b) => b.checked_in_at).reduce((n, b) => n + (b.seats || []).length, 0);
        if (statsEl) statsEl.textContent = `예매 ${allBookings.length}건 · ${people}명  |  입장 완료 ${inPeople}명  |  대기 ${people - inPeople}명`;

        adminList.innerHTML = rows.length
          ? `<li class="admin-booking-row admin-checkin-row admin-booking-head">
               <span>예매번호</span><span>이름</span><span>연락처</span><span>좌석</span><span>예매일시</span><span>입장</span>
             </li>` + rows.map((b) => `
            <li class="admin-booking-row admin-checkin-row${b.checked_in_at ? ' is-in' : ''}">
              <span>${codeOf(b)}</span>
              <span><strong>${esc(b.name)}</strong></span>
              <span>${esc(b.phone)}</span>
              <span>${esc((b.seats || []).join(', '))}</span>
              <span>${new Date(b.created_at).toLocaleDateString('ko-KR')}</span>
              <span>${b.checked_in_at
                ? `<button type="button" class="checkin-btn done" data-checkin="${b.id}" data-undo="1">입장 완료 ${timeOf(b.checked_in_at)}</button>`
                : `<button type="button" class="checkin-btn" data-checkin="${b.id}">입장 확인</button>`}</span>
            </li>`).join('')
          : `<li>${q ? '검색 결과가 없습니다.' : '예매 내역이 없습니다.'}</li>`;
      };

      const msgEl = document.querySelector('[data-checkin-msg]');
      const showMsg = (text, isError) => {
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.hidden = !text;
        msgEl.classList.toggle('is-error', !!isError);
      };
      adminList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-checkin]');
        if (!btn) return;
        const booking = allBookings.find((b) => String(b.id) === btn.dataset.checkin);
        if (!booking) return;
        // 입장 완료 취소는 실수 방지를 위해 두 번 눌러야 함 (팝업 대신 버튼 문구로 안내)
        if (btn.dataset.undo && !btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.textContent = '한 번 더 누르면 취소';
          setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; renderBookings(); } }, 3000);
          return;
        }
        const value = btn.dataset.undo ? null : new Date().toISOString();
        btn.disabled = true;
        showMsg('저장 중…', false);
        const { data: updated, error } = await supabaseClient.from('bookings').update({ checked_in_at: value }).eq('id', booking.id).select('id');
        if (error || !updated || !updated.length) {
          btn.disabled = false;
          showMsg('입장 체크를 저장하지 못했어요. Supabase에서 supabase-schema-addon-5.sql 을 실행했는지, 관리자 계정으로 로그인했는지 확인해 주세요.' + (error ? ` (${error.message})` : ' (권한 없음: 0행 수정됨)'), true);
          return;
        }
        booking.checked_in_at = value;
        showMsg(`${booking.name || ''} 님 ${value ? '입장 완료' : '입장 취소'} 처리했어요.`, false);
        renderBookings();
      });
      searchEl?.addEventListener('input', renderBookings);
      renderBookings();
    }

    const adminSeatSections = document.querySelector('[data-admin-seat-sections]');
    if (adminSeatSections) {
      const adminVipList = document.querySelector('[data-admin-vip-list]');
      const saveVipBtn = document.querySelector('[data-save-vip-seats]');
      const vipStatusEl = document.querySelector('[data-vip-save-status]');

      const [{ data: bookingsForSeats }, { data: vipRows }] = await Promise.all([
        supabaseClient.from('bookings').select('seats'),
        supabaseClient.from('vip_seats').select('seat_code'),
      ]);

      const bookedSeats = new Set();
      (bookingsForSeats || []).forEach((b) => (b.seats || []).forEach((c) => bookedSeats.add(c)));

      const vipSeats = new Set((vipRows || []).map((row) => row.seat_code));

      const updateVipSummary = () => {
        const list = [...vipSeats].sort();
        adminVipList.innerHTML = list.length
          ? list.map((s) => `<li>• ${s}</li>`).join('')
          : '<li>선택된 VIP 좌석이 없습니다.</li>';
      };

      buildSeatMap(adminSeatSections, {
        getState: (code) => (bookedSeats.has(code) ? 'taken' : (vipSeats.has(code) ? 'vip' : 'available')),
        onClick: (code, seat, applyState) => {
          if (bookedSeats.has(code)) return;
          if (vipSeats.has(code)) {
            vipSeats.delete(code);
          } else {
            vipSeats.add(code);
          }
          applyState(seat, vipSeats.has(code) ? 'vip' : 'available');
          updateVipSummary();
        }
      });

      updateVipSummary();

      saveVipBtn.addEventListener('click', async () => {
        await supabaseClient.from('vip_seats').delete().neq('seat_code', '');
        const seatCodes = [...vipSeats];
        if (seatCodes.length) {
          await supabaseClient.from('vip_seats').insert(seatCodes.map((seat_code) => ({ seat_code })));
        }
        vipStatusEl.classList.add('show');
        window.clearTimeout(vipStatusEl._hideTimer);
        vipStatusEl._hideTimer = window.setTimeout(() => vipStatusEl.classList.remove('show'), 2000);
      });
    }
  }

  if (currentAdminPage === 'admin-films.html') {
    const filmTabsEl = document.querySelector('[data-admin-film-tabs]');
    const filmListEl = document.querySelector('[data-admin-film-list]');
    const addFilmBtn = document.querySelector('[data-add-film]');
    if (filmTabsEl && filmListEl) {
      let activeCat = '4th';

      const resizeImageFile = (file, maxDim = 1600, quality = 0.82) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = maxDim / Math.max(width, height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });

      const renderStillRow = (src) => `
        <div class="admin-still-row">
          <div class="admin-still-thumb" style="background-image:url('${src}')"></div>
          <input type="text" class="admin-still-url" value="${src}" />
          <button type="button" class="secondary-btn" data-remove-still>삭제</button>
        </div>
      `;

      const renderAdminFilmCard = (film) => `
        <div class="admin-film-card" data-film-id="${film.id}">
          <div class="admin-film-preview" data-preview style="background-image:url('${film.stills[0] || film.image}')"></div>
          <div class="admin-film-fields">
            <div class="admin-field admin-field-wide">
              <label>스틸컷 (여러 장 등록 가능, 첫 번째 사진이 대표 사진)</label>
              <div class="admin-stills-list" data-stills-list>
                ${film.stills.map(renderStillRow).join('')}
              </div>
              <div class="admin-stills-add">
                <input type="text" placeholder="이미지 URL 입력 후 추가" data-new-still-url />
                <button type="button" class="secondary-btn" data-add-still-url>URL 추가</button>
                <input type="file" accept="image/*" data-new-still-file />
              </div>
            </div>
            <div class="admin-field admin-field-wide">
              <label>감독 사진 (비워두면 대표 이미지가 사용됩니다)</label>
              <div class="admin-director-photo-row">
                <div class="admin-director-photo-thumb" data-director-photo-thumb style="background-image:url('${film.directorPhoto || film.image}')"></div>
                <div class="admin-director-photo-inputs">
                  <input type="text" data-field="directorPhoto" data-director-photo-url value="${film.directorPhoto || ''}" placeholder="이미지 URL" />
                  <input type="file" accept="image/*" data-director-photo-file />
                </div>
              </div>
            </div>
            <div class="admin-field">
              <label>제목</label>
              <input type="text" data-field="title" value="${film.title}" />
            </div>
            <div class="admin-field">
              <label>감독</label>
              <input type="text" data-field="director" value="${film.director}" />
            </div>
            <div class="admin-field">
              <label>장르</label>
              <input type="text" data-field="genre" value="${film.genre}" />
            </div>
            <div class="admin-field">
              <label>러닝타임</label>
              <input type="text" data-field="runtime" value="${film.runtime}" />
            </div>
            <div class="admin-field">
              <label>연도</label>
              <input type="text" data-field="year" value="${film.year}" />
            </div>
            <div class="admin-field admin-field-wide">
              <label>시놉시스</label>
              <textarea data-field="synopsis">${film.synopsis}</textarea>
            </div>
            <div class="admin-field admin-field-wide">
              <label>감독 소개</label>
              <textarea data-field="directorBio">${film.directorBio}</textarea>
            </div>
            <div class="admin-field admin-field-wide">
              <label>크레딧 (한 줄에 "역할: 이름")</label>
              <textarea data-field="credits">${film.credits.join('\n')}</textarea>
            </div>
            <div class="admin-film-actions">
              <button type="button" class="primary-btn" data-save-film>저장</button>
              <button type="button" class="secondary-btn" data-delete-film>영화 삭제</button>
              <span class="admin-save-status" data-save-status>저장되었습니다</span>
            </div>
          </div>
        </div>
      `;

      const wireStillsList = (card) => {
        const stillsList = card.querySelector('[data-stills-list]');
        const preview = card.querySelector('[data-preview]');

        const updatePreview = () => {
          const firstUrl = stillsList.querySelector('.admin-still-url')?.value;
          if (firstUrl) preview.style.backgroundImage = `url('${firstUrl}')`;
        };

        const wireRow = (row) => {
          const urlInput = row.querySelector('.admin-still-url');
          const thumb = row.querySelector('.admin-still-thumb');
          urlInput.addEventListener('input', () => {
            thumb.style.backgroundImage = `url('${urlInput.value}')`;
            updatePreview();
          });
          row.querySelector('[data-remove-still]').addEventListener('click', () => {
            if (stillsList.children.length <= 1) {
              alert('최소 1장의 스틸컷이 필요합니다.');
              return;
            }
            row.remove();
            updatePreview();
          });
        };

        stillsList.querySelectorAll('.admin-still-row').forEach(wireRow);

        const addStill = (src) => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = renderStillRow(src).trim();
          const row = wrapper.firstChild;
          stillsList.appendChild(row);
          wireRow(row);
          updatePreview();
        };

        card.querySelector('[data-add-still-url]').addEventListener('click', () => {
          const input = card.querySelector('[data-new-still-url]');
          const value = input.value.trim();
          if (!value) return;
          addStill(value);
          input.value = '';
        });

        card.querySelector('[data-new-still-file]').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const dataUrl = await resizeImageFile(file);
          addStill(dataUrl);
          e.target.value = '';
        });

        const directorPhotoThumb = card.querySelector('[data-director-photo-thumb]');
        const directorPhotoUrlInput = card.querySelector('[data-director-photo-url]');
        directorPhotoUrlInput.addEventListener('input', () => {
          directorPhotoThumb.style.backgroundImage = `url('${directorPhotoUrlInput.value}')`;
        });
        card.querySelector('[data-director-photo-file]').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const dataUrl = await resizeImageFile(file);
          directorPhotoUrlInput.value = dataUrl;
          directorPhotoThumb.style.backgroundImage = `url('${dataUrl}')`;
          e.target.value = '';
        });
      };

      const renderAdminFilmList = (category) => {
        activeCat = category;
        const films = filmCatalog.filter((item) => item.category === category);
        filmListEl.innerHTML = films.map(renderAdminFilmCard).join('') || '<p class="admin-hint">해당 카테고리에 등록된 영화가 없습니다. "새 영화 추가" 버튼으로 등록해 보세요.</p>';

        filmListEl.querySelectorAll('[data-film-id]').forEach((card) => {
          const filmId = card.dataset.filmId;
          const statusEl = card.querySelector('[data-save-status]');

          wireStillsList(card);

          card.querySelector('[data-save-film]').addEventListener('click', async () => {
            const film = filmCatalog.find((item) => item.id === filmId);
            if (!film) return;
            const stills = Array.from(card.querySelectorAll('.admin-still-url'))
              .map((input) => input.value.trim())
              .filter(Boolean);
            film.stills = stills.length ? stills : [film.image];
            film.image = film.stills[0];
            film.title = card.querySelector('[data-field="title"]').value.trim();
            film.director = card.querySelector('[data-field="director"]').value.trim();
            film.genre = card.querySelector('[data-field="genre"]').value.trim();
            film.runtime = card.querySelector('[data-field="runtime"]').value.trim();
            film.year = card.querySelector('[data-field="year"]').value.trim();
            film.synopsis = card.querySelector('[data-field="synopsis"]').value.trim();
            film.directorBio = card.querySelector('[data-field="directorBio"]').value.trim();
            film.directorPhoto = card.querySelector('[data-field="directorPhoto"]').value.trim();
            film.credits = card.querySelector('[data-field="credits"]').value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);

            const error = await updateFilm(film);
            if (error) { window.alert('저장 중 오류가 발생했습니다: ' + error.message); return; }

            statusEl.classList.add('show');
            window.clearTimeout(statusEl._hideTimer);
            statusEl._hideTimer = window.setTimeout(() => statusEl.classList.remove('show'), 2000);
          });

          card.querySelector('[data-delete-film]').addEventListener('click', async () => {
            const film = filmCatalog.find((item) => item.id === filmId);
            if (!film) return;
            if (!window.confirm(`"${film.title}"을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
            const index = filmCatalog.findIndex((item) => item.id === filmId);
            if (index !== -1) filmCatalog.splice(index, 1);
            const error = await deleteFilm(filmId);
            if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
            renderAdminFilmList(activeCat);
          });
        });
      };

      filmTabsEl.querySelectorAll('.admin-film-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          filmTabsEl.querySelectorAll('.admin-film-tab').forEach((item) => item.classList.toggle('active', item === tab));
          renderAdminFilmList(tab.dataset.cat);
        });
      });

      addFilmBtn?.addEventListener('click', async () => {
        const newFilm = {
          id: `${activeCat}-${Date.now()}`,
          category: activeCat,
          title: '새 영화 제목',
          director: '감독 이름',
          runtime: '00m',
          genre: '장르',
          year: String(new Date().getFullYear()),
          image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1800&q=80',
          stills: ['https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1800&q=80'],
          synopsis: '시놉시스를 입력해 주세요.',
          directorBio: '감독 소개를 입력해 주세요.',
          directorPhoto: '',
          credits: ['감독: ']
        };
        const error = await insertFilm(newFilm);
        if (error) { window.alert('추가 중 오류가 발생했습니다: ' + error.message); return; }
        filmCatalog.push(newFilm);
        renderAdminFilmList(activeCat);
      });

      renderAdminFilmList('4th');
    }
  }

  if (currentAdminPage === 'admin-members.html') {
    const memberListEl = document.querySelector('[data-admin-member-list]');
    if (memberListEl) {
      const renderMembers = async () => {
        const { data: members, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true });

        if (error || !members || !members.length) {
          memberListEl.innerHTML = '<li>가입한 회원이 없습니다.</li>';
          return;
        }

        memberListEl.innerHTML = members.map((member) => `
          <li>
            <div class="admin-member-info">
              <strong>${member.name || member.username}</strong>
              <span>${member.username} · ${member.email || '-'}</span>
            </div>
            ${member.is_super_admin
              ? '<span class="admin-hint" style="margin:0;">최고관리자</span>'
              : `<div class="admin-member-actions">
                  <button type="button" class="secondary-btn" data-toggle-admin="${member.id}" data-current-role="${member.role}">
                    ${member.role === 'admin' ? '관리자 해제' : '관리자 승인'}
                  </button>
                  <button type="button" class="secondary-btn admin-member-delete" data-delete-member="${member.id}" data-member-name="${member.name || member.username}">
                    탈퇴 처리
                  </button>
                </div>`}
          </li>
        `).join('');

        memberListEl.querySelectorAll('[data-toggle-admin]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-toggle-admin');
            const newRole = btn.getAttribute('data-current-role') === 'admin' ? 'member' : 'admin';
            const { error: rpcError } = await supabaseClient.rpc('set_member_role', { target_id: targetId, new_role: newRole });
            if (rpcError) {
              alert(`권한 변경 중 오류가 발생했습니다: ${rpcError.message}`);
              return;
            }
            renderMembers();
          });
        });

        memberListEl.querySelectorAll('[data-delete-member]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-delete-member');
            const targetName = btn.getAttribute('data-member-name');
            if (!confirm(`"${targetName}" 회원을 탈퇴 처리할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
            const { error: deleteError } = await supabaseClient.from('profiles').delete().eq('id', targetId);
            if (deleteError) {
              alert(`탈퇴 처리 중 오류가 발생했습니다: ${deleteError.message}`);
              return;
            }
            renderMembers();
          });
        });
      };
      await renderMembers();
    }
  }

  if (currentAdminPage === 'admin-notices.html') {
    const noticeListEl = document.querySelector('[data-admin-notice-list]');
    const addNoticeBtn = document.querySelector('[data-add-notice]');
    if (noticeListEl) {
      const renderAdminNoticeCard = (notice) => `
        <div class="admin-notice-card" data-notice-id="${notice.id}">
          <div class="admin-field">
            <label>태그 (예: 공지, 비워두면 표시하지 않음)</label>
            <input type="text" data-field="tag" value="${notice.tag || ''}" />
          </div>
          <div class="admin-field">
            <label>날짜</label>
            <input type="text" data-field="date" value="${notice.date}" placeholder="2026.09.01" />
          </div>
          <div class="admin-field admin-field-wide">
            <label>제목</label>
            <input type="text" data-field="title" value="${notice.title}" />
          </div>
          <div class="admin-field admin-field-wide">
            <label>내용 (한 줄에 한 문단씩 입력)</label>
            <textarea data-field="body">${notice.body.join('\n')}</textarea>
          </div>
          <div class="admin-film-actions">
            <button type="button" class="primary-btn" data-save-notice>저장</button>
            <button type="button" class="secondary-btn" data-delete-notice>삭제</button>
            <span class="admin-save-status" data-save-status>저장되었습니다</span>
          </div>
        </div>
      `;

      const renderAdminNoticeList = () => {
        const notices = noticeCatalog;
        noticeListEl.innerHTML = notices.length
          ? notices.map(renderAdminNoticeCard).join('')
          : '<p class="admin-hint">등록된 공지가 없습니다.</p>';

        noticeListEl.querySelectorAll('.admin-notice-card').forEach((card) => {
          const id = card.dataset.noticeId;

          card.querySelector('[data-save-notice]').addEventListener('click', async () => {
            const notice = noticeCatalog.find((n) => n.id === id);
            if (!notice) return;
            notice.tag = card.querySelector('[data-field="tag"]').value.trim();
            notice.date = card.querySelector('[data-field="date"]').value.trim();
            notice.title = card.querySelector('[data-field="title"]').value.trim();
            notice.body = card.querySelector('[data-field="body"]').value
              .split('\n').map((line) => line.trim()).filter(Boolean);
            const error = await updateNotice(notice);
            if (error) { window.alert('저장 중 오류가 발생했습니다: ' + error.message); return; }

            const statusEl = card.querySelector('[data-save-status]');
            statusEl.classList.add('show');
            window.clearTimeout(statusEl._hideTimer);
            statusEl._hideTimer = window.setTimeout(() => statusEl.classList.remove('show'), 2000);
          });

          card.querySelector('[data-delete-notice]').addEventListener('click', async () => {
            if (!confirm('이 공지를 삭제할까요?')) return;
            const error = await deleteNotice(id);
            if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
            const index = noticeCatalog.findIndex((n) => n.id === id);
            if (index !== -1) noticeCatalog.splice(index, 1);
            renderAdminNoticeList();
          });
        });
      };

      renderAdminNoticeList();

      addNoticeBtn?.addEventListener('click', async () => {
        const newNotice = {
          id: `notice-${Date.now()}`,
          tag: '공지',
          date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
          title: '새 공지 제목을 입력해 주세요.',
          body: ['내용을 입력해 주세요.'],
        };
        const error = await insertNotice(newNotice);
        if (error) { window.alert('추가 중 오류가 발생했습니다: ' + error.message); return; }
        noticeCatalog.unshift(newNotice);
        renderAdminNoticeList();
      });
    }
  }

  if (currentAdminPage === 'admin-schedule.html') {
    const calGridEl = document.querySelector('[data-admin-calendar]');
    const listEl = document.querySelector('[data-admin-schedule-list]');
    if (calGridEl && listEl) {
      const scheduleData = await loadSchedule();
      const CATS = ['홍보', '기획·장소', '운영·제작', '굿즈', '후원'];
      const COLORS = { '홍보': '#e6a12d', '기획·장소': '#102245', '운영·제작': '#2f8f7a', '굿즈': '#a35bc9', '후원': '#c0553d' };
      const $ = (sel) => document.querySelector(sel);
      const calMonthLabel = $('[data-cal-month]');
      const upcomingEl = $('[data-upcoming]');
      const allBtn = $('[data-toggle-all]');
      const msgEl = $('[data-schedule-msg]');
      const filterEl = $('[data-schedule-filter]');
      const viewDate = new Date();
      viewDate.setDate(1);
      let activeCat = 'all';

      const pad2 = (n) => String(n).padStart(2, '0');
      const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const todayISO = () => { const n = new Date(); return toISO(n.getFullYear(), n.getMonth(), n.getDate()); };
      const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const rangeLabel = (i) => (i.endDate && i.endDate !== i.date ? `${i.date.replaceAll('-', '.')} ~ ${i.endDate.replaceAll('-', '.')}` : i.date.replaceAll('-', '.'));
      const showMsg = (text, isError) => {
        msgEl.textContent = text;
        msgEl.hidden = !text;
        msgEl.classList.toggle('is-error', !!isError);
        if (text && !isError) setTimeout(() => { if (msgEl.textContent === text) msgEl.hidden = true; }, 2500);
      };
      const visible = () => scheduleData.filter((i) => activeCat === 'all' || i.category === activeCat);
      const chip = (cat) => `<span class="sch-chip" style="background:${COLORS[cat] || '#888'}">${esc(cat)}</span>`;

      const legendEl = $('[data-calendar-legend]');
      if (legendEl) legendEl.innerHTML = CATS.map((c) => `<span><span class="admin-cal-dot" style="background:${COLORS[c]}"></span>${c}</span>`).join('');

      // ---- 추가/수정 팝업 (하나로 통합) ----
      let editing = null;
      const modal = document.createElement('div');
      modal.className = 'login-modal-overlay';
      modal.hidden = true;
      modal.innerHTML = `
        <div class="login-modal" role="dialog" aria-modal="true">
          <button class="login-modal-close" type="button" aria-label="닫기">×</button>
          <h2 data-m-title>일정 추가</h2>
          <form data-m-form>
            <label for="sm-cat">카테고리</label>
            <select id="sm-cat">${CATS.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
            <label for="sm-title">일정 제목</label>
            <input type="text" id="sm-title" required />
            <label for="sm-date">시작일</label>
            <input type="date" id="sm-date" required />
            <label for="sm-end">종료일 <small>(기간이 있을 때만)</small></label>
            <input type="date" id="sm-end" />
            <label for="sm-memo">메모 <small>(선택)</small></label>
            <input type="text" id="sm-memo" />
            <p class="schedule-msg is-error" data-m-error hidden></p>
            <button class="primary-btn" type="submit" style="margin-top: 16px; width: 100%;" data-m-save>추가</button>
            <button class="secondary-btn" type="button" style="margin-top: 8px; width: 100%;" data-m-delete hidden>삭제</button>
          </form>
          <p class="admin-hint" data-m-creator style="margin-top: 12px;"></p>
        </div>`;
      document.body.appendChild(modal);
      const m = (sel) => modal.querySelector(sel);
      const closeModal = () => { modal.hidden = true; editing = null; };
      m('.login-modal-close').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

      const openModal = (item, dateISO) => {
        editing = item || null;
        m('[data-m-title]').textContent = item ? '일정 수정' : '일정 추가';
        m('[data-m-save]').textContent = item ? '저장' : '추가';
        m('[data-m-delete]').hidden = !item;
        m('[data-m-delete]').textContent = '삭제';
        delete m('[data-m-delete]').dataset.armed;
        m('[data-m-error]').hidden = true;
        m('#sm-cat').value = item ? item.category : CATS[0];
        m('#sm-title').value = item ? item.title : '';
        m('#sm-date').value = item ? item.date : (dateISO || todayISO());
        m('#sm-end').value = item ? (item.endDate || '') : '';
        m('#sm-memo').value = item ? (item.memo || '') : '';
        m('[data-m-creator]').textContent = item ? `등록자: ${item.createdByName || '-'}` : '';
        modal.hidden = false;
        m('#sm-title').focus();
      };

      m('[data-m-form]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = m('[data-m-error]');
        const date = m('#sm-date').value;
        const endDate = m('#sm-end').value;
        if (endDate && endDate < date) { errEl.textContent = '종료일이 시작일보다 빠릅니다.'; errEl.hidden = false; return; }
        const fields = { category: m('#sm-cat').value, date, endDate, title: m('#sm-title').value.trim() || '새 일정', memo: m('#sm-memo').value.trim() };
        if (editing) {
          Object.assign(editing, fields);
          const error = await updateScheduleItem(editing);
          if (error) { errEl.textContent = '저장하지 못했어요: ' + error.message; errEl.hidden = false; return; }
          showMsg('수정했어요.');
        } else {
          const item = { id: `sch-${Date.now()}`, ...fields, createdByName: currentUser?.name || currentUser?.username || '관리자' };
          const error = await insertScheduleItem(item);
          if (error) { errEl.textContent = '추가하지 못했어요: ' + error.message; errEl.hidden = false; return; }
          scheduleData.push(item);
          showMsg('추가했어요.');
        }
        closeModal();
        renderAll();
      });

      // 삭제는 팝업(confirm) 대신 두 번 눌러 확인
      m('[data-m-delete]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!btn.dataset.armed) {
          btn.dataset.armed = '1';
          btn.textContent = '한 번 더 누르면 삭제돼요';
          setTimeout(() => { delete btn.dataset.armed; btn.textContent = '삭제'; }, 3000);
          return;
        }
        const error = await deleteScheduleItem(editing.id);
        if (error) { const errEl = m('[data-m-error]'); errEl.textContent = '삭제하지 못했어요: ' + error.message; errEl.hidden = false; return; }
        scheduleData.splice(scheduleData.findIndex((s) => s.id === editing.id), 1);
        closeModal();
        showMsg('삭제했어요.');
        renderAll();
      });

      // ---- 화면 그리기 ----
      const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        calMonthLabel.textContent = `${year}년 ${month + 1}월`;
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = todayISO();
        const items = visible();
        let html = '';
        for (let i = 0; i < firstDay; i++) html += '<div class="admin-cal-day is-empty"></div>';
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = toISO(year, month, d);
          const dayEvents = items.filter((it) => iso >= it.date && iso <= (it.endDate || it.date));
          const shown = dayEvents.slice(0, 3);
          const more = dayEvents.length - shown.length;
          html += `<div class="admin-cal-day${iso === today ? ' is-today' : ''}" data-date="${iso}">
            <div class="admin-cal-day-num">${d}</div>
            ${shown.map((ev) => `<span class="admin-cal-event" draggable="true" data-from="${iso}" data-schedule-id="${esc(ev.id)}" style="background:${COLORS[ev.category] || '#888'}" title="${esc(ev.title)}">${esc(ev.title)}</span>`).join('')}
            ${more > 0 ? `<div class="admin-cal-more" data-more-date="${iso}">+${more}개 더보기</div>` : ''}
          </div>`;
        }
        calGridEl.innerHTML = html;
        calGridEl.querySelectorAll('.admin-cal-day:not(.is-empty)').forEach((el) => el.addEventListener('click', () => openModal(null, el.dataset.date)));
        // 일정을 끌어서 다른 날짜로 옮기기 (잡은 날짜가 놓은 날짜로 가도록 기간 전체를 이동)
        calGridEl.querySelectorAll('.admin-cal-event').forEach((el) => {
          el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', `${el.dataset.scheduleId}|${el.dataset.from}`);
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('is-dragging');
          });
          el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
        });
        calGridEl.querySelectorAll('.admin-cal-day:not(.is-empty)').forEach((dayEl) => {
          dayEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dayEl.classList.add('drag-over'); });
          dayEl.addEventListener('dragleave', () => dayEl.classList.remove('drag-over'));
          dayEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            calGridEl.querySelectorAll('.drag-over').forEach((d) => d.classList.remove('drag-over'));
            const [id, fromISO] = (e.dataTransfer.getData('text/plain') || '').split('|');
            const item = scheduleData.find((x) => x.id === id);
            const toISOStr = dayEl.dataset.date;
            if (!item || !fromISO || fromISO === toISOStr) return;
            const toUTC = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
            const diffDays = Math.round((toUTC(toISOStr) - toUTC(fromISO)) / 86400000);
            const shift = (iso) => { const d = new Date(toUTC(iso) + diffDays * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
            const before = { date: item.date, endDate: item.endDate };
            item.date = shift(item.date);
            if (item.endDate) item.endDate = shift(item.endDate);
            const error = await updateScheduleItem(item);
            if (error) {
              Object.assign(item, before);
              showMsg('옮기지 못했어요: ' + error.message, true);
            } else {
              showMsg(`"${item.title}" ${before.date.slice(5).replace('-', '.')} → ${item.date.slice(5).replace('-', '.')} 로 옮겼어요.`);
            }
            renderAll();
          });
        });
        calGridEl.querySelectorAll('[data-more-date]').forEach((el) => el.addEventListener('click', (e) => {
          e.stopPropagation();
          openDayList(el.dataset.moreDate);
        }));
        calGridEl.querySelectorAll('.admin-cal-event').forEach((el) => el.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = scheduleData.find((s) => s.id === el.dataset.scheduleId);
          if (item) openModal(item);
        }));
      };

      const rowHTML = (it) => `
        <button type="button" class="sch-row" data-edit-id="${esc(it.id)}">
          <span class="sch-date">${rangeLabel(it)}</span>
          ${chip(it.category)}
          <span class="sch-title">${esc(it.title)}</span>
          ${it.memo ? `<span class="sch-memo">${esc(it.memo)}</span>` : ''}
        </button>`;
      const bindRows = (root, before) => root.querySelectorAll('[data-edit-id]').forEach((b) => b.addEventListener('click', () => {
        const item = scheduleData.find((s) => s.id === b.dataset.editId);
        if (before) before();
        if (item) openModal(item);
      }));

      // ---- 하루 일정 목록 팝업 ("+N개 더보기") ----
      const dayModal = document.createElement('div');
      dayModal.className = 'login-modal-overlay';
      dayModal.hidden = true;
      dayModal.innerHTML = `
        <div class="login-modal" role="dialog" aria-modal="true">
          <button class="login-modal-close" type="button" aria-label="닫기">×</button>
          <h2 data-day-title></h2>
          <div class="schedule-day-list" data-day-list></div>
          <button class="primary-btn" type="button" data-day-add style="margin-top: 16px; width: 100%;">+ 이 날짜에 일정 추가</button>
        </div>`;
      document.body.appendChild(dayModal);
      const closeDay = () => { dayModal.hidden = true; };
      dayModal.querySelector('.login-modal-close').addEventListener('click', closeDay);
      dayModal.addEventListener('click', (e) => { if (e.target === dayModal) closeDay(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dayModal.hidden) closeDay(); });
      let dayISO = '';
      const openDayList = (iso) => {
        dayISO = iso;
        const items = visible().filter((it) => iso >= it.date && iso <= (it.endDate || it.date));
        dayModal.querySelector('[data-day-title]').textContent = `${iso.replaceAll('-', '.')} 일정 ${items.length}개`;
        const box = dayModal.querySelector('[data-day-list]');
        box.innerHTML = items.map(rowHTML).join('');
        bindRows(box, closeDay);
        dayModal.hidden = false;
      };
      dayModal.querySelector('[data-day-add]').addEventListener('click', () => { closeDay(); openModal(null, dayISO); });

      const renderUpcoming = () => {
        const today = todayISO();
        const next = visible().filter((i) => (i.endDate || i.date) >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
        upcomingEl.innerHTML = next.length ? next.map(rowHTML).join('') : '<p class="admin-hint">다가오는 일정이 없어요.</p>';
        bindRows(upcomingEl);
      };

      const renderAllList = () => {
        const all = visible().slice().sort((a, b) => a.date.localeCompare(b.date));
        allBtn.textContent = `${listEl.hidden ? '전체 일정 보기' : '전체 일정 접기'} (${all.length}건)`;
        allBtn.setAttribute('aria-expanded', String(!listEl.hidden));
        if (listEl.hidden) return;
        listEl.innerHTML = all.length ? all.map(rowHTML).join('') : '<p class="admin-hint">등록된 일정이 없어요.</p>';
        bindRows(listEl);
      };

      function renderAll() { renderCalendar(); renderUpcoming(); renderAllList(); }

      // ---- 이벤트 ----
      $('[data-add-schedule]')?.addEventListener('click', () => openModal(null, todayISO()));
      $('[data-cal-prev]')?.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); });
      $('[data-cal-next]')?.addEventListener('click', () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); });
      allBtn.addEventListener('click', () => { listEl.hidden = !listEl.hidden; renderAllList(); });
      filterEl?.querySelectorAll('.admin-schedule-filter-btn').forEach((btn) => btn.addEventListener('click', () => {
        filterEl.querySelectorAll('.admin-schedule-filter-btn').forEach((it) => it.classList.toggle('active', it === btn));
        activeCat = btn.dataset.cat;
        renderAll();
      }));

      renderAll();
    }
  }

  if (currentAdminPage === 'admin-sponsors.html') {
    const sponsorListEl = document.querySelector('[data-admin-sponsor-list]');
    const addSponsorBtn = document.querySelector('[data-add-sponsor]');
    const sponsorSummaryEl = document.querySelector('[data-sponsor-summary]');
    if (sponsorListEl) {
      const sponsorData = await loadSponsors();
      const SPONSOR_STATUS_OPTIONS = ['협의중', '확정', '완료'];
      const SPONSOR_TYPE_OPTIONS = ['현금', '물품'];

      const renderSponsorCard = (sponsor) => `
        <div class="admin-notice-card" data-sponsor-id="${sponsor.id}">
          <div class="admin-field">
            <label>후원사명</label>
            <input type="text" data-field="name" value="${sponsor.name || ''}" />
          </div>
          <div class="admin-field">
            <label>구분</label>
            <select data-field="type">
              ${SPONSOR_TYPE_OPTIONS.map((t) => `<option value="${t}" ${sponsor.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="admin-field">
            <label>금액/내용</label>
            <input type="text" data-field="amount" value="${sponsor.amount || ''}" placeholder="예: 100만원 또는 음료 200개" />
          </div>
          <div class="admin-field">
            <label>상태</label>
            <select data-field="status">
              ${SPONSOR_STATUS_OPTIONS.map((s) => `<option value="${s}" ${sponsor.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="admin-field admin-field-wide">
            <label>담당자 연락처</label>
            <input type="text" data-field="contact" value="${sponsor.contact || ''}" />
          </div>
          <div class="admin-field admin-field-wide">
            <label>메모</label>
            <textarea data-field="memo">${sponsor.memo || ''}</textarea>
          </div>
          <div class="admin-film-actions">
            <button type="button" class="primary-btn" data-save-sponsor>저장</button>
            <button type="button" class="secondary-btn" data-delete-sponsor>삭제</button>
            <span class="admin-save-status" data-save-status>저장되었습니다</span>
          </div>
        </div>
      `;

      const renderSponsorSummary = () => {
        const sponsors = sponsorData;
        const confirmed = sponsors.filter((s) => s.status === '확정' || s.status === '완료').length;
        const pending = sponsors.filter((s) => s.status === '협의중').length;
        sponsorSummaryEl.textContent = sponsors.length
          ? `총 ${sponsors.length}건 · 확정/완료 ${confirmed}건 · 협의중 ${pending}건`
          : '등록된 후원 현황이 없습니다.';
      };

      const renderSponsorList = () => {
        const sponsors = sponsorData;
        renderSponsorSummary();
        sponsorListEl.innerHTML = sponsors.length
          ? sponsors.map(renderSponsorCard).join('')
          : '<p class="admin-hint">등록된 후원사가 없습니다. "+ 후원사 추가" 버튼으로 등록해 보세요.</p>';

        sponsorListEl.querySelectorAll('.admin-notice-card').forEach((card) => {
          const id = card.dataset.sponsorId;

          card.querySelector('[data-save-sponsor]').addEventListener('click', async () => {
            const sponsor = sponsorData.find((s) => s.id === id);
            if (!sponsor) return;
            sponsor.name = card.querySelector('[data-field="name"]').value.trim();
            sponsor.type = card.querySelector('[data-field="type"]').value;
            sponsor.amount = card.querySelector('[data-field="amount"]').value.trim();
            sponsor.status = card.querySelector('[data-field="status"]').value;
            sponsor.contact = card.querySelector('[data-field="contact"]').value.trim();
            sponsor.memo = card.querySelector('[data-field="memo"]').value.trim();
            const error = await updateSponsor(sponsor);
            if (error) { window.alert('저장 중 오류가 발생했습니다: ' + error.message); return; }

            // 현금 후원이 확정/완료되면 정산에 수입 추가
            if (sponsor.type === '현금' && (sponsor.status === '확정' || sponsor.status === '완료')) {
              const amountNum = Number(sponsor.amount.replace(/[^\d]/g, '')) || 0;
              if (amountNum > 0) {
                const settlementItem = {
                  id: `settlement-${Date.now()}`,
                  date: new Date().toISOString().split('T')[0],
                  type: '수입',
                  category: '후원',
                  item: sponsor.name,
                  amount: amountNum,
                };
                await insertSettlementItem(settlementItem);
              }
            }
            renderSponsorSummary();

            const statusEl = card.querySelector('[data-save-status]');
            statusEl.classList.add('show');
            window.clearTimeout(statusEl._hideTimer);
            statusEl._hideTimer = window.setTimeout(() => statusEl.classList.remove('show'), 2000);
          });

          card.querySelector('[data-delete-sponsor]').addEventListener('click', async () => {
            if (!confirm('이 후원사 정보를 삭제할까요?')) return;
            const error = await deleteSponsor(id);
            if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
            const index = sponsorData.findIndex((s) => s.id === id);
            if (index !== -1) sponsorData.splice(index, 1);
            renderSponsorList();
          });
        });
      };

      renderSponsorList();

      addSponsorBtn?.addEventListener('click', async () => {
        const newSponsor = {
          id: `sponsor-${Date.now()}`,
          name: '새 후원사',
          type: '현금',
          amount: '',
          status: '협의중',
          contact: '',
          memo: '',
        };
        const error = await insertSponsor(newSponsor);
        if (error) { window.alert('추가 중 오류가 발생했습니다: ' + error.message); return; }
        sponsorData.unshift(newSponsor);
        renderSponsorList();
      });
    }
  }

  if (currentAdminPage === 'admin-settlement.html') {
    const settlementListEl = document.querySelector('[data-admin-settlement-list]');
    const addSettlementBtn = document.querySelector('[data-add-settlement]');
    const settlementSummaryEl = document.querySelector('[data-settlement-summary]');
    if (settlementListEl) {
      const settlementData = await loadSettlement();
      const renderSettlementRow = (item) => `
        <div class="admin-schedule-row" data-settlement-id="${item.id}">
          <input type="date" data-field="date" value="${item.date || ''}" />
          <select data-field="type">
            <option value="수입" ${item.type === '수입' ? 'selected' : ''}>수입</option>
            <option value="지출" ${item.type === '지출' ? 'selected' : ''}>지출</option>
          </select>
          <input type="text" data-field="category" value="${item.category || ''}" placeholder="구분 (예: 후원/굿즈/대관료)" />
          <input type="text" data-field="item" value="${item.item || ''}" placeholder="항목" />
          <input type="number" data-field="amount" value="${item.amount || 0}" placeholder="금액" />
          <button type="button" class="secondary-btn" data-delete-settlement>삭제</button>
        </div>
      `;

      const renderSettlementSummary = () => {
        const items = settlementData;
        const income = items.filter((i) => i.type === '수입').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        const expense = items.filter((i) => i.type === '지출').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        settlementSummaryEl.innerHTML = `
          <div class="admin-settlement-total"><span>총 수입</span><strong>${income.toLocaleString()}원</strong></div>
          <div class="admin-settlement-total"><span>총 지출</span><strong>${expense.toLocaleString()}원</strong></div>
          <div class="admin-settlement-total"><span>잔액</span><strong>${(income - expense).toLocaleString()}원</strong></div>
        `;
      };

      const renderSettlementList = () => {
        const items = settlementData.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        renderSettlementSummary();
        settlementListEl.innerHTML = items.length
          ? items.map(renderSettlementRow).join('')
          : '<p class="admin-hint">등록된 정산 내역이 없습니다.</p>';

        settlementListEl.querySelectorAll('.admin-schedule-row').forEach((row) => {
          const id = row.dataset.settlementId;
          row.querySelectorAll('input, select').forEach((input) => {
            input.addEventListener('change', async () => {
              const item = settlementData.find((s) => s.id === id);
              if (!item) return;
              item[input.dataset.field] = input.dataset.field === 'amount' ? Number(input.value) : input.value;
              const error = await updateSettlementItem(item);
              if (error) { window.alert('저장 중 오류가 발생했습니다: ' + error.message); return; }
              renderSettlementSummary();
            });
          });
          row.querySelector('[data-delete-settlement]').addEventListener('click', async () => {
            const error = await deleteSettlementItem(id);
            if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
            const index = settlementData.findIndex((s) => s.id === id);
            if (index !== -1) settlementData.splice(index, 1);
            renderSettlementList();
          });
        });
      };

      renderSettlementList();

      addSettlementBtn?.addEventListener('click', async () => {
        const newItem = { id: `settle-${Date.now()}`, date: new Date().toISOString().slice(0, 10), type: '지출', category: '', item: '새 항목', amount: 0 };
        const error = await insertSettlementItem(newItem);
        if (error) { window.alert('추가 중 오류가 발생했습니다: ' + error.message); return; }
        settlementData.push(newItem);
        renderSettlementList();
      });
    }
  }

  if (window.location.pathname.endsWith('reserve.html')) {
    const user = currentUser;
    if (!user) {
      window.location.href = 'login.html?redirect=reserve.html';
      return;
    }

    const seatSections = document.querySelector('[data-seat-sections]');
    const bookingList = document.querySelector('#bookingList');
    const totalPrice = document.querySelector('#totalPrice');
    const confirmBtn = document.querySelector('#confirmBooking');
    const selectedSeats = new Set();
    const MAX_PEOPLE = 6;
    let people = 1;
    const countEl = document.querySelector('#peopleCount');
    const hintEl = document.querySelector('#seatHint');
    const chipsEl = document.querySelector('#seatChips');
    const progressEl = document.querySelector('#seatProgress');

    // 다른 사람의 예매는 RLS 때문에 직접 읽을 수 없으므로, 좌석 코드만 돌려주는 RPC를 사용
    // (supabase-schema-addon-4.sql 적용 전에는 예전 방식으로 대체)
    const getTakenSeats = async () => {
      const { data: rpcSeats, error: rpcError } = await supabaseClient.rpc('get_taken_seats');
      if (!rpcError && Array.isArray(rpcSeats)) return new Set(rpcSeats);
      const [{ data: bookings }, { data: vipRows }] = await Promise.all([
        supabaseClient.from('bookings').select('seats'),
        supabaseClient.from('vip_seats').select('seat_code'),
      ]);
      const taken = new Set((vipRows || []).map((row) => row.seat_code));
      (bookings || []).forEach((b) => (b.seats || []).forEach((code) => taken.add(code)));
      return taken;
    };

    function updateSummary() {
      const seatList = [...selectedSeats].sort();
      const remain = people - seatList.length;
      countEl.textContent = people;
      document.querySelector('#peopleMinus').disabled = people <= 1;
      document.querySelector('#peoplePlus').disabled = people >= MAX_PEOPLE;
      progressEl.textContent = `${seatList.length} / ${people}석 선택`;
      chipsEl.innerHTML = seatList.length
        ? seatList.map((seat) => `<span class="seat-chip">${seat}</span>`).join('')
        : '<span class="seat-chip-empty">좌석을 선택해 주세요</span>';
      hintEl.textContent = remain > 0 ? `${remain}석을 더 선택해 주세요.` : '좌석 선택이 끝났어요. 예매를 확정해 주세요.';
      totalPrice.textContent = '무료';
      confirmBtn.disabled = remain !== 0;
    }

    const setPeople = (n) => {
      people = Math.min(MAX_PEOPLE, Math.max(1, n));
      const extra = [...selectedSeats].sort().slice(people);
      extra.forEach((code) => {
        selectedSeats.delete(code);
        const el = document.querySelector(`.seat[data-code="${code}"]`);
        if (el) { el.classList.remove('selected'); el.textContent = code.match(/\d+$/)[0]; }
      });
      updateSummary();
    };
    document.querySelector('#peopleMinus').addEventListener('click', () => setPeople(people - 1));
    document.querySelector('#peoplePlus').addEventListener('click', () => setPeople(people + 1));
    document.querySelector('#seatReset').addEventListener('click', () => {
      [...selectedSeats].forEach((code) => {
        selectedSeats.delete(code);
        const el = document.querySelector(`.seat[data-code="${code}"]`);
        if (el) { el.classList.remove('selected'); el.textContent = code.match(/\d+$/)[0]; }
      });
      updateSummary();
    });
    const nameEl = document.querySelector('[data-summary-name]');
    if (nameEl) nameEl.textContent = user.name || user.username;

    const SCREENING_DATETIME_LABEL = '2026년 12월 04일 (금) 16:00';

    const openBookingConfirmModal = (seatList) => {
      let overlay = document.getElementById('booking-confirm-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'login-modal-overlay';
        overlay.id = 'booking-confirm-overlay';
        overlay.innerHTML = `
          <div class="login-modal" role="dialog" aria-modal="true">
            <button class="login-modal-close" type="button" aria-label="닫기">×</button>
            <h2>예매가 완료되었습니다</h2>
            <p class="booking-confirm-thanks">소중한 시간 내어 매직아워를 찾아주셔서 진심으로 감사드립니다.</p>
            <div class="booking-confirm-details">
              <div><strong>상영 일시</strong><span data-confirm-datetime></span></div>
              <div><strong>선택 좌석</strong><span data-confirm-seats></span></div>
            </div>
            <button class="primary-btn" type="button" data-confirm-close style="margin-top: 20px; width: 100%;">확인</button>
          </div>
        `;
        document.body.appendChild(overlay);
        const closeModal = () => { overlay.hidden = true; };
        overlay.querySelector('.login-modal-close').addEventListener('click', closeModal);
        overlay.querySelector('[data-confirm-close]').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !overlay.hidden) closeModal();
        });
      }
      overlay.querySelector('[data-confirm-datetime]').textContent = SCREENING_DATETIME_LABEL;
      overlay.querySelector('[data-confirm-seats]').textContent = seatList.join(', ');
      overlay.hidden = false;
    };

    let takenSeats = await getTakenSeats();
    buildSeatMap(seatSections, {
      getState: (code) => (takenSeats.has(code) ? 'taken' : (selectedSeats.has(code) ? 'selected' : 'available')),
      onClick: (code, seat, applyState) => {
        if (takenSeats.has(code)) return;
        if (selectedSeats.has(code)) {
          selectedSeats.delete(code);
        } else {
          if (selectedSeats.size >= people) {
            hintEl.textContent = `선택한 인원(${people}명)만큼 좌석을 골랐어요. 인원을 늘리거나 다른 좌석을 해제해 주세요.`;
            return;
          }
          selectedSeats.add(code);
        }
        applyState(seat, selectedSeats.has(code) ? 'selected' : 'available');
        updateSummary();
      }
    });

    confirmBtn.addEventListener('click', async () => {
      const seatList = [...selectedSeats].sort();
      if (!seatList.length) {
        alert('좌석을 선택해 주세요.');
        return;
      }

      const { error } = await supabaseClient.from('bookings').insert({
        user_id: user.id,
        name: user.name || user.username,
        email: user.email || '',
        phone: user.phone || '',
        seats: seatList,
      });

      if (error) {
        if ((error.message || '').includes('SEAT_TAKEN')) {
          // 그 사이 다른 분이 먼저 예매한 좌석 → 최신 상태로 갱신
          takenSeats = await getTakenSeats();
          seatList.forEach((code) => {
            if (!takenSeats.has(code)) return;
            selectedSeats.delete(code);
            const el = document.querySelector(`.seat[data-code="${code}"]`);
            if (el) { el.classList.remove('selected'); el.classList.add('unavailable'); el.disabled = true; el.textContent = '■'; }
          });
          updateSummary();
          alert('방금 다른 분이 먼저 예매한 좌석이 있어요. 좌석을 다시 선택해 주세요.');
          return;
        }
        alert(`예매 중 오류가 발생했습니다: ${error.message}`);
        return;
      }

      openBookingConfirmModal(seatList);

      seatList.forEach((code) => takenSeats.add(code));
      selectedSeats.clear();
      document.querySelectorAll('.seat').forEach((seat) => {
        const code = seat.dataset.code;
        if (takenSeats.has(code)) {
          seat.classList.remove('selected');
          seat.classList.add('unavailable');
          seat.disabled = true;
          seat.textContent = '■';
        }
      });
      updateSummary();
    });

    updateSummary();
  }
});

// Magic Hour v4: D-day + 스크롤 리빌
(() => {
  const dd = document.querySelector('[data-dday]');
  if (dd) {
    const days = Math.ceil((new Date('2026-12-04T16:00:00+09:00') - new Date()) / 864e5);
    dd.textContent = days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : '상영 종료';
  }
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
})();
