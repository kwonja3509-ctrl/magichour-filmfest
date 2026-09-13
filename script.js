document.addEventListener('DOMContentLoaded', async () => {
  let authRedirectTarget = null;

  const isAdminUser = (user) => !!user && user.role === 'admin';

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
        <label for="auth-reset-username">아이디</label>
        <input type="text" id="auth-reset-username" placeholder="아이디를 입력하세요" required />
        <p class="login-modal-error" id="auth-error-password" hidden></p>
        <p class="login-modal-success" id="auth-success-password" hidden></p>
        <button class="login-modal-submit" type="submit">재설정 링크 받기</button>
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
        const username = box.querySelector('#auth-reset-username').value.trim();
        const errorEl = box.querySelector('#auth-error-password');
        const successEl = box.querySelector('#auth-success-password');
        errorEl.hidden = true;
        successEl.hidden = true;

        const { data: email } = await supabaseClient.rpc('get_email_by_username', { lookup_username: username });
        if (!email) {
          errorEl.textContent = '입력하신 아이디를 찾을 수 없습니다.';
          errorEl.hidden = false;
          return;
        }

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
        if (error) {
          errorEl.textContent = '재설정 메일 발송 중 오류가 발생했습니다.';
          errorEl.hidden = false;
          return;
        }
        successEl.textContent = '가입하신 이메일로 비밀번호 재설정 링크를 보내드렸습니다.';
        successEl.hidden = false;
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
        bookingList.innerHTML = '<li>아직 예매 내역이 없습니다.</li>';
        return;
      }

      bookingList.innerHTML = userBookings.map((booking) => `
        <li>
          <div>
            <strong>${new Date(booking.created_at).toLocaleDateString()}</strong><br>
            ${(booking.seats || []).join(', ')}
          </div>
          <button class="secondary-btn" type="button" data-mypage-cancel="${booking.id}">취소</button>
        </li>
      `).join('');

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
    if (isAdminUser(currentUser)) {
      window.location.href = 'admin.html';
      return;
    }
    openMypageModal();
  };
  window.openAccountEntry = openAccountEntry;

  document.querySelectorAll('[data-header-login]').forEach((button) => {
    button.textContent = currentUser ? (isAdminUser(currentUser) ? '관리자' : '마이페이지') : '로그인';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openAccountEntry();
    });

    if (currentUser) {
      const actionsWrap = button.closest('.top-actions') || button.parentElement;
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

  const resetForm = document.querySelector('#resetForm');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(resetForm);
      const username = String(form.get('username') || '').trim();
      const { data: email } = await supabaseClient.rpc('get_email_by_username', { lookup_username: username });
      if (!email) {
        alert('입력하신 아이디를 찾을 수 없습니다.');
        return;
      }
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
      if (error) {
        alert('재설정 메일 발송 중 오류가 발생했습니다.');
        return;
      }
      alert('가입하신 이메일로 비밀번호 재설정 링크를 보내드렸습니다.');
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

  const SEAT_ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  const buildSeatMap = (container, { getState, onClick }) => {
    const sections = [
      { key: 'left', count: 8, base: 0, mid: false },
      { key: 'center', count: 8, base: 8, mid: true },
      { key: 'right', count: 8, base: 16, mid: false }
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

    sections.forEach(({ count, base, mid }) => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'seat-section';
      SEAT_ROW_LABELS.forEach((rowLabel) => {
        const row = document.createElement('div');
        row.className = mid ? 'seat-row mid' : 'seat-row';
        for (let i = 1; i <= count; i += 1) {
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
        sectionEl.appendChild(row);
      });
      container.appendChild(sectionEl);
    });
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
      id: 'metro-ipsu-makina',
      category: '4th',
      title: '메트로 입수 마키나',
      director: '박주환',
      runtime: '28분',
      genre: '드라마',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
      stills: [
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
        'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1800&q=80'
      ],
      synopsis: '오래된 다리 위에서 시작된 대화는 사람의 기억을 서서히 불러오고, 잊힌 감정은 다시금 가장 조용한 공간에서 피어납니다. 서로를 알아보지 못한 채 서로의 삶을 헤매며, 결국엔 서로를 가장 깊이 이해하게 되는 이야기입니다.',
      directorBio: '대학에서 영화를 전공했다. 단편 《기묘한 하루》와 《지나간 시간》을 통해 감정의 미세한 변화를 정교하게 담아냈다. 그리고 《메트로 입수 마키나》를 통해 영화가 사람의 기억을 어떻게 건드리는지를 탐색하고 있다.',
      credits: ['연출/각본: 박주환', '개퍼: 박민경', '촬영: 황효식, 송지현', '조연출: 차윤아', '제작: 장준혁', '스크립터: 황지원', '사운드: 김소랑', '음악: 임준규', '필름제공처: 센트럴파크', '조명: 이현준']
    },
    {
      id: 'grad-se-bum-mun',
      category: 'grad',
      title: '세 번째 문',
      director: '정민서',
      runtime: '14m',
      genre: '드라마',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?auto=format&fit=crop&w=1800&q=80',
      synopsis: '서로 다른 시간대의 기억들이 하나의 문 앞에서 겹치며 사람과 사람 사이의 미묘한 거리감을 드러내는 작품입니다.',
      directorBio: '정민서 | 연세예술원 영상전공. 대사보다 침묵의 밀도를 탐색하는 연출을 선보이고 있습니다.',
      credits: ['감독: 정민서', '촬영: 이도현', '편집: 최시은', '음악: 강우진']
    },
    {
      id: 'grad-ohhu-ui-nun',
      category: 'grad',
      title: '오후의 눈',
      director: '김태윤',
      runtime: '13m',
      genre: '실험영화',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
      synopsis: '하루의 끝과 시작 사이에 남은 어두운 창틈을 통해 도시의 감정과 사람들의 공백을 묘사한 장면 중심의 실험영화입니다.',
      directorBio: '김태윤 | 영화연출 전공. 빛의 흐름과 시선의 여백을 활용해 공간의 감정을 재구성합니다.',
      credits: ['감독: 김태윤', '촬영: 고서연', '편집: 한지환', '음악: 윤혜준']
    },
    {
      id: 'grad-mujigae-sihum',
      category: 'grad',
      title: '무지개 실험',
      director: '박하람',
      runtime: '12m',
      genre: '장편성형',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1800&q=80',
      synopsis: '아름다운 색이 사라지는 순간, 각자 다른 방식으로 세상을 바라보던 네 인물이 서로의 감정을 교차시키며 삶의 일부를 되찾습니다.',
      directorBio: '박하람 | 영상 제작을 통해 색채와 심리적 공간을 연결하는 실험적인 연출가입니다.',
      credits: ['감독: 박하람', '촬영: 정우진', '편집: 신다은', '음악: 이수빈']
    },
    {
      id: '3rd-i-eups-ui-cho-sang',
      category: '3rd',
      title: '이웃의 초상',
      director: '한서윤',
      runtime: '18m',
      genre: '서사',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1800&q=80',
      synopsis: '오래된 골목에 살던 사람들의 표정과 시간의 흔적을 따라가며, 기억 속으로 들어간 이웃들의 삶을 조용히 기록합니다.',
      directorBio: '한서윤 | 3기 졸업영화 감독. 사람들의 표정과 환경의 리듬을 섬세하게 살려 동시대의 감성을 담아냅니다.',
      credits: ['감독: 한서윤', '각본: 오시온', '촬영: 강현우', '편집: 유서린']
    },
    {
      id: '3rd-bich-ui-jeom',
      category: '3rd',
      title: '빛의 잔향',
      director: '오시온',
      runtime: '17m',
      genre: '감성드라마',
      year: '2025',
      image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1800&q=80',
      synopsis: '어느 날 갑자기 사라진 빛의 흔적을 따라가며 사람과 공간이 남긴 기억을 조용히 복원하는 이야기입니다.',
      directorBio: '오시온 | 감정의 미세한 변화를 화면에 정직하게 남기며, 장면의 리듬을 섬세하게 운용합니다.',
      credits: ['감독: 오시온', '촬영: 강은재', '편집: 윤민채', '음악: 서승우']
    },
    {
      id: '3rd-geu-nal-ui-jeong-won',
      category: '3rd',
      title: '그날의 정원',
      director: '박소윤',
      runtime: '16m',
      genre: '서정',
      year: '2026',
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80',
      synopsis: '시들어가는 정원과 잠깐 만난 인연을 통해 누군가의 삶이 어떤 방식으로 다시 피어나는지를 보여주는 작품입니다.',
      directorBio: '박소윤 | 공간의 정적과 인물의 표정을 같이 살피며 감정의 흐름을 정교하게 그립니다.',
      credits: ['감독: 박소윤', '촬영: 한수아', '편집: 김규리', '음악: 박예진']
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
      const prevBtn = homeProgramCarousel.querySelector('.home-program-nav.left');
      const nextBtn = homeProgramCarousel.querySelector('.home-program-nav.right');
      let page = 0;

      const updateHomeProgramSlider = () => {
        const cards = Array.from(homeProgramGrid.children);
        if (!cards.length) return;
        const cardRect = cards[0].getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(homeProgramGrid).gap) || 0;
        const viewportWidth = homeProgramCarousel.querySelector('.home-program-viewport').clientWidth;
        const visibleCount = Math.max(1, Math.round((viewportWidth + gap) / (cardRect.width + gap)));
        const maxPage = Math.max(0, cards.length - visibleCount);
        page = Math.min(page, maxPage);
        const offset = page * (cardRect.width + gap);
        homeProgramGrid.style.transform = `translateX(-${offset}px)`;
        if (prevBtn) prevBtn.disabled = page <= 0;
        if (nextBtn) nextBtn.disabled = page >= maxPage;
      };

      prevBtn?.addEventListener('click', () => {
        page -= 1;
        updateHomeProgramSlider();
      });
      nextBtn?.addEventListener('click', () => {
        page += 1;
        updateHomeProgramSlider();
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
        detailDate.textContent = data.date;
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
      if (isAdminUser(cheerUser)) return true;
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
        bookingList.innerHTML = '<li>아직 예매 내역이 없습니다.</li>';
      } else {
        bookingList.innerHTML = userBookings.map((booking) => `
          <li>
            <div>
              <strong>${new Date(booking.created_at).toLocaleDateString()}</strong><br>
              ${(booking.seats || []).join(', ')}
            </div>
            <button class="secondary-btn" type="button" data-cancel-booking="${booking.id}">취소</button>
          </li>
        `).join('');

        bookingList.querySelectorAll('[data-cancel-booking]').forEach((btn) => {
          btn.addEventListener('click', async () => {
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

  const ADMIN_PAGES = ['admin.html', 'admin-films.html', 'admin-members.html', 'admin-notices.html', 'admin-schedule.html', 'admin-sponsors.html', 'admin-settlement.html'];
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

  if (currentAdminPage === 'admin.html') {
    const adminList = document.querySelector('[data-admin-bookings]');
    if (adminList) {
      const { data: bookings } = await supabaseClient
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      adminList.innerHTML = bookings && bookings.length
        ? `<li class="admin-booking-row admin-booking-head">
             <span>이름</span><span>연락처</span><span>이메일</span><span>좌석</span><span>예매일시</span>
           </li>` +
          bookings.map((booking) => `
            <li class="admin-booking-row">
              <span>${booking.name || '-'}</span>
              <span>${booking.phone || '-'}</span>
              <span>${booking.email || '-'}</span>
              <span>${(booking.seats || []).join(', ')}</span>
              <span>${new Date(booking.created_at).toLocaleString()}</span>
            </li>
          `).join('')
        : '<li>예매 내역이 없습니다.</li>';
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
    const scheduleListEl = document.querySelector('[data-admin-schedule-list]');
    const addScheduleBtn = document.querySelector('[data-add-schedule]');
    const scheduleFilterEl = document.querySelector('[data-schedule-filter]');
    if (scheduleListEl) {
      const scheduleData = await loadSchedule();
      const SCHEDULE_CATEGORY_OPTIONS = ['홍보', '기획·장소', '운영·제작', '굿즈', '후원'];
      const SCHEDULE_CATEGORY_COLORS = {
        '홍보': '#e6a12d',
        '기획·장소': '#102245',
        '운영·제작': '#2f8f7a',
        '굿즈': '#a35bc9',
        '후원': '#c0553d',
      };
      let activeScheduleCat = 'all';

      const calMonthLabel = document.querySelector('[data-cal-month]');
      const calGridEl = document.querySelector('[data-admin-calendar]');
      const calLegendEl = document.querySelector('[data-calendar-legend]');
      const calPrevBtn = document.querySelector('[data-cal-prev]');
      const calNextBtn = document.querySelector('[data-cal-next]');
      const calViewDate = new Date();

      const pad2 = (n) => String(n).padStart(2, '0');
      const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

      const getScheduleModalOverlay = () => {
        let overlay = document.getElementById('schedule-modal-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.className = 'login-modal-overlay';
        overlay.id = 'schedule-modal-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
          <div class="login-modal" role="dialog" aria-modal="true">
            <button class="login-modal-close" type="button" aria-label="닫기">×</button>
            <h2>일정 추가</h2>
            <form id="schedule-modal-form">
              <label for="schedule-modal-category">카테고리</label>
              <select id="schedule-modal-category">
                ${SCHEDULE_CATEGORY_OPTIONS.map((c) => `<option value="${c}">${c}</option>`).join('')}
              </select>
              <label for="schedule-modal-date">날짜</label>
              <input type="date" id="schedule-modal-date" required />
              <label for="schedule-modal-endDate">종료일 (기간이 있는 일정만)</label>
              <input type="date" id="schedule-modal-endDate" />
              <label for="schedule-modal-title">일정 제목</label>
              <input type="text" id="schedule-modal-title" placeholder="일정 제목" required />
              <label for="schedule-modal-memo">메모 (선택)</label>
              <input type="text" id="schedule-modal-memo" placeholder="메모" />
              <button class="primary-btn" type="submit" style="margin-top: 18px;">추가</button>
            </form>
          </div>
        `;
        document.body.appendChild(overlay);

        const closeModal = () => { overlay.hidden = true; };
        overlay.querySelector('.login-modal-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !overlay.hidden) closeModal();
        });

        overlay.querySelector('#schedule-modal-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const newItem = {
            id: `sch-${Date.now()}`,
            category: overlay.querySelector('#schedule-modal-category').value,
            date: overlay.querySelector('#schedule-modal-date').value,
            endDate: overlay.querySelector('#schedule-modal-endDate').value,
            title: overlay.querySelector('#schedule-modal-title').value.trim() || '새 일정',
            memo: overlay.querySelector('#schedule-modal-memo').value.trim(),
            createdByName: currentUser?.name || currentUser?.username || '관리자',
          };
          const error = await insertScheduleItem(newItem);
          if (error) { window.alert('추가 중 오류가 발생했습니다: ' + error.message); return; }
          scheduleData.push(newItem);
          closeModal();
          renderScheduleList();
        });

        return overlay;
      };

      const openScheduleAddModal = (dateISO) => {
        const overlay = getScheduleModalOverlay();
        overlay.querySelector('#schedule-modal-form').reset();
        overlay.querySelector('#schedule-modal-date').value = dateISO;
        overlay.hidden = false;
      };

      const getScheduleDetailModalOverlay = () => {
        let overlay = document.getElementById('schedule-detail-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.className = 'login-modal-overlay';
        overlay.id = 'schedule-detail-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
          <div class="login-modal" role="dialog" aria-modal="true">
            <button class="login-modal-close" type="button" aria-label="닫기">×</button>
            <h2 data-detail-title>일정 상세</h2>
            <p class="schedule-detail-meta" data-detail-meta></p>
            <p class="schedule-detail-memo" data-detail-memo></p>
            <p class="admin-hint" data-detail-creator style="margin-top:14px;"></p>
            <button class="secondary-btn admin-member-delete" type="button" data-detail-delete style="margin-top:10px; width:100%;">이 일정 취소</button>
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

      const openScheduleDetailModal = (item) => {
        const overlay = getScheduleDetailModalOverlay();
        overlay.querySelector('[data-detail-title]').textContent = item.title;
        const dateLabel = item.endDate && item.endDate !== item.date ? `${item.date} ~ ${item.endDate}` : item.date;
        overlay.querySelector('[data-detail-meta]').textContent = `${item.category} · ${dateLabel}`;
        overlay.querySelector('[data-detail-memo]').textContent = item.memo || '메모 없음';
        overlay.querySelector('[data-detail-creator]').textContent = `등록자: ${item.createdByName || '-'}`;

        overlay.querySelector('[data-detail-delete]').onclick = async () => {
          if (!confirm(`"${item.title}" 일정을 취소할까요?`)) return;
          const error = await deleteScheduleItem(item.id);
          if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
          const index = scheduleData.findIndex((s) => s.id === item.id);
          if (index !== -1) scheduleData.splice(index, 1);
          overlay.hidden = true;
          renderScheduleList();
        };

        overlay.hidden = false;
      };

      const renderCalendar = () => {
        if (!calGridEl) return;
        const year = calViewDate.getFullYear();
        const month = calViewDate.getMonth();
        calMonthLabel.textContent = `${year}년 ${month + 1}월`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const now = new Date();
        const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
        const schedule = scheduleData;

        let html = '';
        for (let i = 0; i < firstDay; i++) {
          html += '<div class="admin-cal-day is-empty"></div>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const dateISO = toISO(year, month, d);
          const dayEvents = schedule.filter((item) => dateISO >= item.date && dateISO <= (item.endDate || item.date));
          const isToday = dateISO === todayISO;
          const visibleEvents = dayEvents.slice(0, 3);
          const moreCount = dayEvents.length - visibleEvents.length;
          html += `
            <div class="admin-cal-day${isToday ? ' is-today' : ''}" data-date="${dateISO}">
              <div class="admin-cal-day-num">${d}</div>
              ${visibleEvents.map((ev) => `<span class="admin-cal-event" data-schedule-id="${ev.id}" style="background:${SCHEDULE_CATEGORY_COLORS[ev.category] || '#888'}" title="${ev.title}">${ev.title}</span>`).join('')}
              ${moreCount > 0 ? `<div class="admin-cal-more">+${moreCount}개 더보기</div>` : ''}
            </div>
          `;
        }
        calGridEl.innerHTML = html;

        calGridEl.querySelectorAll('.admin-cal-day:not(.is-empty)').forEach((dayEl) => {
          dayEl.addEventListener('click', () => openScheduleAddModal(dayEl.dataset.date));
        });

        calGridEl.querySelectorAll('.admin-cal-event').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = scheduleData.find((s) => s.id === el.dataset.scheduleId);
            if (item) openScheduleDetailModal(item);
          });
        });
      };

      if (calLegendEl) {
        calLegendEl.innerHTML = SCHEDULE_CATEGORY_OPTIONS.map((c) => `
          <span><span class="admin-cal-dot" style="background:${SCHEDULE_CATEGORY_COLORS[c]}"></span>${c}</span>
        `).join('');
      }

      calPrevBtn?.addEventListener('click', () => {
        calViewDate.setMonth(calViewDate.getMonth() - 1);
        renderCalendar();
      });
      calNextBtn?.addEventListener('click', () => {
        calViewDate.setMonth(calViewDate.getMonth() + 1);
        renderCalendar();
      });

      const renderScheduleRow = (item) => `
        <div class="admin-schedule-row" data-schedule-id="${item.id}">
          <select data-field="category">
            ${SCHEDULE_CATEGORY_OPTIONS.map((c) => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <input type="date" data-field="date" value="${item.date}" />
          <input type="date" data-field="endDate" value="${item.endDate || ''}" title="종료일 (기간이 있는 일정만)" />
          <input type="text" data-field="title" value="${item.title}" placeholder="일정 제목" />
          <input type="text" data-field="memo" value="${item.memo || ''}" placeholder="메모 (선택)" />
          <span class="admin-schedule-creator" title="등록자">${item.createdByName || '-'}</span>
          <button type="button" class="secondary-btn" data-delete-schedule>삭제</button>
        </div>
      `;

      const renderScheduleList = () => {
        renderCalendar();
        const schedule = scheduleData
          .filter((item) => activeScheduleCat === 'all' || item.category === activeScheduleCat)
          .slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        scheduleListEl.innerHTML = schedule.length
          ? schedule.map(renderScheduleRow).join('')
          : '<p class="admin-hint">등록된 일정이 없습니다.</p>';

        scheduleListEl.querySelectorAll('.admin-schedule-row').forEach((row) => {
          const id = row.dataset.scheduleId;
          row.querySelectorAll('input, select').forEach((input) => {
            input.addEventListener('change', async () => {
              const item = scheduleData.find((s) => s.id === id);
              if (!item) return;
              item[input.dataset.field] = input.value;
              const error = await updateScheduleItem(item);
              if (error) { window.alert('저장 중 오류가 발생했습니다: ' + error.message); return; }
              renderCalendar();
            });
          });
          row.querySelector('[data-delete-schedule]').addEventListener('click', async () => {
            const error = await deleteScheduleItem(id);
            if (error) { window.alert('삭제 중 오류가 발생했습니다: ' + error.message); return; }
            const index = scheduleData.findIndex((s) => s.id === id);
            if (index !== -1) scheduleData.splice(index, 1);
            renderScheduleList();
          });
        });
      };

      renderScheduleList();

      scheduleFilterEl?.querySelectorAll('.admin-schedule-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          scheduleFilterEl.querySelectorAll('.admin-schedule-filter-btn').forEach((item) => item.classList.toggle('active', item === btn));
          activeScheduleCat = btn.dataset.cat;
          renderScheduleList();
        });
      });

      addScheduleBtn?.addEventListener('click', () => {
        openScheduleAddModal(new Date().toISOString().slice(0, 10));
      });
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

    const getTakenSeats = async () => {
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
      bookingList.innerHTML = seatList.length
        ? seatList.map((seat) => `<li>• ${seat}</li>`).join('')
        : '<li>선택된 좌석이 없습니다.</li>';
      totalPrice.textContent = '무료';
    }

    const takenSeats = await getTakenSeats();
    buildSeatMap(seatSections, {
      getState: (code) => (takenSeats.has(code) ? 'taken' : (selectedSeats.has(code) ? 'selected' : 'available')),
      onClick: (code, seat, applyState) => {
        if (takenSeats.has(code)) return;
        if (selectedSeats.has(code)) {
          selectedSeats.delete(code);
        } else {
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
        alert(`예매 중 오류가 발생했습니다: ${error.message}`);
        return;
      }

      alert(`예매가 완료되었습니다. 선택 좌석: ${seatList.join(', ')}`);

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
