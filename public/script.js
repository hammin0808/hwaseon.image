// 네이버 블로그 본문 URL만 남기는 함수 (최상단에 선언)
function isRealBlogPost(url) {
  return /PostView\.naver\?blogId=.+&logNo=/.test(url);
}
// index.html
if (document.getElementById('uploadForm')) {
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'none';
  const previewDiv = document.getElementById('preview');
  previewDiv.style.display = 'none';
  let previewUrl = '';
  document.getElementById('imageInput').onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
      previewDiv.innerHTML = file.name;
      previewDiv.style.display = '';
      previewUrl = URL.createObjectURL(file);
    } else {
      previewDiv.innerHTML = '';
      previewDiv.style.display = 'none';
      previewUrl = '';
    }
  };
  document.getElementById('uploadForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const file = document.getElementById('imageInput').files[0];
    // memo를 배열이 아닌 단일 값으로 보냄
    const memoInput = document.querySelector('input[name="memo"]');
    if (memoInput) {
      formData.set('memo', memoInput.value);
    }
    try {
      const res = await fetch('/upload', { 
        method: 'POST', 
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      let imgTag = '';
      if (file) {
        imgTag = `<div style='width:100%;text-align:center;'><img src="${previewUrl}" class="result-img" alt="업로드 이미지" id="result-img-thumb"></div>`;
      }
      // 서버가 urls, memos 배열로 응답하면 첫 번째 값 사용
      const url = data.url || (data.urls && data.urls[0]);
      const memo = data.memo || (data.memos && data.memos[0]);
      const urlText = url ? `${location.origin}${url}` : '';
      resultDiv.innerHTML =
        `<div class="result-box" style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          ${imgTag}
          <div class="result-info" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;">
            <div class='result-url-row' style="margin-bottom:4px;display:flex;align-items:center;gap:8px;">
              <span class='result-url'><span style="color:#1877f2;font-weight:bold;">URL  </span> <a href="${url}" target="_blank">${urlText}</a></span>
              <button class='copy-btn' id='copy-url-btn' type='button'>복사</button>
            </div>
            <div class='result-memo' style="margin-top:4px;"><span style="color:#1877f2;font-weight:bold;">메모:</span> ${memo || ''}</div>
          </div>
        </div>`;
      resultDiv.style.display = '';
      // 복사 버튼 이벤트
      document.getElementById('copy-url-btn').onclick = function() {
        const url = this.parentNode.querySelector('a').href;
        navigator.clipboard.writeText(url).then(() => {
          this.innerHTML = '✅';
          setTimeout(() => { this.innerHTML = '복사'; }, 1200);
        });
      };
      // 이미지 썸네일 클릭시 미리보기
      if (file) {
        const thumb = document.getElementById('result-img-thumb');
        thumb.onclick = function() {
          const modal = document.getElementById('img-modal');
          const modalImg = document.getElementById('img-modal-img');
          modalImg.src = previewUrl;
          modal.style.display = 'flex';
        };
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    }
  };
}
if (document.getElementById('dashboardBtn')) {
  document.getElementById('dashboardBtn').addEventListener('click', function(e) {
    e.preventDefault();
    console.log('Dashboard button clicked'); // 디버깅용 로그
    
    // 로그인 상태 확인
    fetch('/me', {
      credentials: 'include'
    })
    .then(response => {
      console.log('Me response:', response.status); // 디버깅용 로그
      if (!response.ok) {
        window.location.href = 'login.html';
        return;
      }
      return response.json();
    })
    .then(data => {
      console.log('Me data:', data); // 디버깅용 로그
      if (!data || !data.id) {
        window.location.href = 'login.html';
        return;
      }
      window.location.href = 'dashboard.html';
    })
    .catch(error => {
      console.error('Dashboard button error:', error); // 디버깅용 로그
      window.location.href = 'login.html';
    });
  });
}
if (document.getElementById('multiMemoBtn')) {
  document.getElementById('multiMemoBtn').onclick = () => {
    location.href = 'multi-memo.html';
  };
}
// dashboard.html
if (document.getElementById('dashboard-tbody')) {
  document.body.style.display = 'none';
  
  // 페이지 로드 시 즉시 로그인 체크
  fetch('/me', {
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      window.location.href = 'login.html';
      return;
    }
    return response.json();
  })
  .then(data => {
    if (!data || !data.id) {
      window.location.href = 'login.html';
      return;
    }
    
    // 로그인된 경우에만 나머지 코드 실행
    document.body.style.display = '';
    const userNameElement = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (data.role === 'admin') {
      userNameElement.innerHTML = '<span class="admin-badge">관리자</span> <span style="color:#1877f2;font-weight:700; margin-right:10px;">' + data.id + '</span>';
    } else {
      userNameElement.innerText = data.id;
    }

    // 로그아웃 기능
    logoutBtn.addEventListener('click', function() {
      fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          window.location.href = 'login.html';
        }
      })
      .catch(error => {
        window.location.href = 'login.html';
      });
    });

    // 대시보드 데이터 로드
    fetch('/dashboard-data', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        // 최근에 만든 이미지가 제일 위에 오도록 내림차순 정렬 (id 기준)
        data.sort((a, b) => {
          const aid = Number(a.id || a.filename?.replace(/\D/g, ''));
          const bid = Number(b.id || b.filename?.replace(/\D/g, ''));
          return bid - aid;
        });

        const tbody = document.getElementById('dashboard-tbody');
        tbody.innerHTML = data.map((img, idx) => {
          // url이 없으면 id로 대체
          const imgUrl = img.url || `/image/${img.id}`;
          const imgId = (img.url ? img.url.split('/').pop() : img.id);
          const fullUrl = `${location.origin}${imgUrl}`;
          const thumbUrl = `/image/${imgId}?dashboard=1`;
          let mainReferer = '-';
          if (img.referers && img.referers.length > 0) {
            const realReferers = img.referers.filter(ref => isRealBlogPost(ref.referer));
            if (realReferers.length > 0) {
              mainReferer = `<a href='${realReferers[0].referer}' target='_blank' class='dashboard-blog-link'>${realReferers[0].referer}</a>`;
            }
          }
          // 소유자 표시: admin만 초록색, 나머지는 기본
          let ownerCell = '-';
          if (img.owner) {
            if (img.owner === 'admin') {
              ownerCell = `<span style="color:#19c37d;font-weight:700;letter-spacing:0.5px;">${img.owner}</span>`;
            } else {
              ownerCell = `<span style="color:#222;font-weight:500;letter-spacing:0.5px;">${img.owner}</span>`;
            }
          }
          return `
            <tr data-id="${imgId}" style="vertical-align:middle;">
              <td style="padding:10px 8px;"><img src="${thumbUrl}" alt="img" class="dashboard-img-thumb" data-img-url="${thumbUrl}" style="max-width:44px;max-height:44px;border-radius:7px;box-shadow:0 2px 8px rgba(24,119,242,0.10);"></td>
              <td style="padding:10px 8px;">
                <button class="dashboard-copy-btn" data-url="${fullUrl}">복사</button>
                <a href="${fullUrl}" target="_blank" class="dashboard-url-link" style="display:inline-block;max-width:220px;overflow-x:auto;vertical-align:middle;">${fullUrl}</a>
              </td>
              <td style="padding:10px 8px;">${mainReferer}</td>
              <td style="word-break:break-all;padding:10px 8px;">${img.memo || '-'}</td>
              <td style="padding:10px 8px;text-align:center;">${ownerCell}</td>
              <td style="padding:10px 8px;"><button class="dashboard-btn-blue dashboard-detail-btn" data-idx="${idx}">보기</button></td>
              <td style="padding:10px 8px;"><button class="dashboard-btn-red dashboard-delete-btn">삭제</button></td>
            </tr>
          `;
        }).join('');

        // 복사 버튼 이벤트
        document.querySelectorAll('.dashboard-copy-btn').forEach(btn => {
          btn.onclick = function(e) {
            const url = this.getAttribute('data-url');
            navigator.clipboard.writeText(url).then(() => {
              this.innerHTML = '✅';
              setTimeout(() => { this.innerHTML = '복사'; }, 1200);
            });
          };
        });

        // 삭제 버튼 이벤트
        document.querySelectorAll('.dashboard-delete-btn').forEach(btn => {
          btn.onclick = function(e) {
            e.stopPropagation();
            const row = this.closest('tr');
            const id = row.getAttribute('data-id');
            if (confirm('정말 삭제하시겠습니까?')) {
              fetch(`/image/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(r => { if (r.success) row.remove(); });
            }
          };
        });

        // 이미지 미리보기 이벤트
        document.querySelectorAll('.dashboard-img-thumb').forEach(imgEl => {
          imgEl.onclick = function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-img-url');
            const modal = document.getElementById('img-modal');
            const modalImg = document.getElementById('img-modal-img');
            modalImg.src = url;
            modal.style.display = 'flex';
          };
        });

        document.querySelectorAll('.dashboard-detail-btn').forEach(btn => {
          btn.onclick = function(e) {
            e.stopPropagation();
            const idx = this.getAttribute('data-idx');
            const img = data[idx];
            fetch(`/image/${img.id}/detail`)
              .then(res => res.json())
              .then(detail => {
                function formatDate(dateStr) {
                  if (!dateStr) return '-';
                  const d = new Date(dateStr);
                  if (isNaN(d.getTime())) return '-';
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth()+1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  const hh = String(d.getHours()).padStart(2, '0');
                  const min = String(d.getMinutes()).padStart(2, '0');
                  const ss = String(d.getSeconds()).padStart(2, '0');
                  return `${yyyy}. ${mm}. ${dd}. ${hh}:${min}:${ss}`;
                }
                // 블로그 유입 정보
                let blogUrl = '-';
                let blogCreated = '-';
                if (detail.referers && detail.referers.length > 0) {
                  const ref = detail.referers[0];
                  blogUrl = `<a href="${ref.referer}" target="_blank" style="color:#3575e1;text-decoration:underline;">${ref.referer}</a>`;
                  blogCreated = formatDate(ref.firstVisit);
                }
                // 방문수, 유니크
                const statBlock = `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:#f8faff;border-radius:12px;padding:18px 32px;margin-bottom:18px;">
                    <div style="font-size:1.08rem;"><b>전체 방문 수</b><div style="color:#1877f2;font-weight:700;font-size:1.25rem;">${detail.views}</div></div>
                    <div style="font-size:1.08rem;"><b>방문 유저 수</b><div style="color:#1877f2;font-weight:700;font-size:1.25rem;">${detail.unique}</div></div>
                  </div>
                `;
                // 블로그 주소/생성일자
                const blogBlock = `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:#f8faff;border-radius:12px;padding:18px 32px;margin-bottom:18px;">
                    <div style="font-size:1.08rem;"><b>블로그 주소</b><div>${blogUrl}</div></div>
                  </div>
                `;
                // 접속 기록 표
                let ipTable = '';
                if (detail.ips && detail.ips.length > 0) {
                  ipTable = `
                    <div style="background:#f8faff;border-radius:12px;padding:18px 32px;">
                      <div style="font-size:1.08rem;font-weight:600;margin-bottom:8px;text-align:left;">접속 로그</div>
                      <table style="width:100%;font-size:1.01em;text-align:center;background:#fff;border-radius:8px;overflow:hidden;">
                        <thead>
                          <tr style="background:#f4f6fa;">
                            <th style="padding:8px 0;">IP</th>
                            <th style="padding:8px 0;">User-Agent</th>
                            <th style="padding:8px 0;">방문수</th>
                          </tr>
                        </thead>
                        <tbody>` +
                    detail.ips.map(ipinfo => {
                      const ipv4 = (ipinfo.ip || '').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
                      return `<tr>
                        <td style="padding:7px 0;">${ipv4 ? ipv4[0] : ipinfo.ip}</td>
                        <td style="padding:7px 0;word-break:break-all;text-align:left;">${ipinfo.ua || '-'}</td>
                        <td style="padding:7px 0;">${ipinfo.count}</td>
                      </tr>`;
                    }).join('') +
                    `</tbody></table></div>`;
                } else {
                  ipTable = '<div style="background:#f8faff;border-radius:12px;padding:18px 32px;text-align:center;color:#888;">접속 기록 없음</div>';
                }
                // 파일명 + 엑셀 버튼 (상단 넉넉한 레이아웃)
                const modalHeader = `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 24px 0 24px;margin-bottom:18px;">
                    <div style="font-size:1.22rem;font-weight:700;color:#1877f2;word-break:break-all;">${detail.filename}</div>
                    <button id="excel-download-btn" style="padding:7px 22px;font-size:1.05rem;background:#19c37d;color:#fff;border:none;border-radius:7px;cursor:pointer;margin-left:32px;">엑셀 다운로드</button>
                  </div>
                `;
                document.getElementById('modal-body').innerHTML =
                  `<div style="padding:28px 28px 16px 28px;">
                    ${modalHeader}
                    <hr style="margin:12px 0;">
                    ${statBlock}
                    <hr style="margin:12px 0;">
                    ${blogBlock}
                    <hr style="margin:12px 0;">
                    ${ipTable}
                  </div>`;
                document.getElementById('modal').style.display = 'flex';

                // 엑셀 다운로드 기능(선택)
                document.getElementById('excel-download-btn').onclick = function() {
                  // 엑셀 다운로드 구현
                  if (typeof XLSX === 'undefined') {
                    alert('엑셀 라이브러리가 로드되지 않았습니다.');
                    return;
                  }
                  // detail 객체는 현재 모달에 표시된 데이터와 동일
                  // 블로그 시트
                  const blogSheet = [
                    ['블로그 링크', '전체 방문수', '방문 유저수', '생성일자'],
                    [
                      detail.blogUrl || '-',
                      detail.views || 0,
                      detail.unique || 0,
                      detail.blogCreated ? formatDate(detail.blogCreated) : '-'
                    ]
                  ];
                  // 유저 시트
                  const userSheet = [
                    ['블로그 링크', 'IP', 'User-Agent', '해당 유저 방문수']
                  ];
                  (detail.ips || []).forEach(row => {
                    userSheet.push([
                      detail.blogUrl || '-',
                      row.ip,
                      row.ua,
                      row.count
                    ]);
                  });
                  // 워크북 생성
                  const wb = XLSX.utils.book_new();
                  const wsBlog = XLSX.utils.aoa_to_sheet(blogSheet);
                  const wsUser = XLSX.utils.aoa_to_sheet(userSheet);
                  // 컬럼 너비 설정 (방문수만 좁게, 나머지는 넉넉히)
                  wsBlog['!cols'] = [
                    { wch: 60 }, // 블로그 링크
                    { wch: 12 }, // 전체 방문수
                    { wch: 14 }, // 방문 유저수
                    { wch: 22 }  // 생성일자
                  ];
                  wsUser['!cols'] = [
                    { wch: 60 }, // 블로그 링크
                    { wch: 18 }, // IP
                    { wch: 40 }, // User-Agent
                    { wch: 10 }  // 방문수(좁게)
                  ];
                  XLSX.utils.book_append_sheet(wb, wsBlog, '블로그');
                  XLSX.utils.book_append_sheet(wb, wsUser, 'User');
                  XLSX.writeFile(wb, 'blog_image_stats.xlsx');
                };
              });
          };
        });
      });
    });
  }

// 이미지 미리보기 모달 닫기 이벤트
document.addEventListener('DOMContentLoaded', function() {
  const imgModal = document.getElementById('img-modal');
  if (imgModal) {
    imgModal.onclick = function(e) {
      if (e.target === this) {
        this.style.display = 'none';
        document.getElementById('img-modal-img').src = '';
      }
    };
  }
});
// 상세보기 모달 리디자인 (3번째 예시처럼)
// ... 기존 상세보기 버튼 이벤트 내부 ...
// 상세 정보 모달 내용 리디자인
// ... existing code ...
// 상세 모달 닫기(X 버튼)
const modalCloseBtn = document.getElementById('modal-close');
if (modalCloseBtn) {
  modalCloseBtn.onclick = function() {
    document.getElementById('modal').style.display = 'none';
  };
}
// 로그인/로그아웃/세션/회원가입 관련
async function login(id, pw) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pw }),
    credentials: 'include'
  });
  if (!res.ok) throw new Error((await res.json()).error || '로그인 실패');
  return res.json();
}
async function logout() {
  await fetch('/logout', { 
    method: 'POST',
    credentials: 'include'
  });
  location.href = 'login.html';
}
async function registerUser(id, pw) {
  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, pw })
  });
  if (!res.ok) throw new Error((await res.json()).error || '생성 실패');
  return res.json();
}
async function checkSession() {
  try {
    const res = await fetch('/dashboard-data', {
      credentials: 'include'
    });
    if (res.status === 401) {
      location.href = 'login.html';
      return false;
    }
    return true;
  } catch (err) {
    console.error('Session check failed:', err);
    location.href = 'login.html';
    return false;
  }
}
// 로그인 페이지 동작
if (document.getElementById('loginForm')) {
  let isAdmin = false;
  const userTab = document.getElementById('userTab');
  const adminTab = document.getElementById('adminTab');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const adminCreateSection = document.getElementById('adminCreateSection');
  const adminCreateForm = document.getElementById('adminCreateForm');
  const adminCreateError = document.getElementById('adminCreateError');
  const adminCreateSuccess = document.getElementById('adminCreateSuccess');
  const userFields = document.getElementById('userFields');
  const loginId = document.getElementById('loginId');
  const loginPw = document.getElementById('loginPw');

  userTab.onclick = () => {
    isAdmin = false;
    userTab.classList.add('active');
    adminTab.classList.remove('active');
    adminCreateSection.style.display = 'none';
    userFields.style.display = '';
    loginId.required = true;
    loginPw.value = '';
    loginId.value = '';
    loginPw.placeholder = '비밀번호를 입력하세요';
    loginPw.setAttribute('autocomplete', 'current-password');
  };
  adminTab.onclick = () => {
    isAdmin = true;
    adminTab.classList.add('active');
    userTab.classList.remove('active');
    adminCreateSection.style.display = 'block';
    userFields.style.display = 'none';
    loginId.required = false;
    loginId.value = '';
    loginPw.value = '';
    loginPw.placeholder = '비밀번호(hwaes...@00)를 입력하세요';
    loginPw.setAttribute('autocomplete', 'current-password');
  };
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    let id, pw;
    if (isAdmin) {
      id = 'hwaseon';
      pw = loginPw.value;
    } else {
      id = loginId.value.trim();
      pw = loginPw.value;
    }
    try {
      const result = await login(id, pw);
      if (isAdmin && result.role !== 'admin') throw new Error('관리자 계정이 아닙니다.');
      if (isAdmin) {
        location.href = 'register.html';
      } else {
        location.href = 'dashboard.html';
      }
    } catch (err) {
      loginError.innerText = err.message;
      loginError.style.display = 'block';
    }
  };
  if (adminCreateForm) {
    adminCreateForm.onsubmit = async (e) => {
      e.preventDefault();
      adminCreateError.style.display = 'none';
      adminCreateSuccess.style.display = 'none';
      const id = document.getElementById('newUserId').value.trim();
      const pw = document.getElementById('newUserPw').value;
      try {
        await registerUser(id, pw);
        adminCreateSuccess.innerText = '사용자 생성 성공!';
        adminCreateSuccess.style.display = 'block';
        adminCreateForm.reset();
      } catch (err) {
        adminCreateError.innerText = err.message;
        adminCreateError.style.display = 'block';
      }
    };
  }
}
// 관리자 페이지(admin.html) 동작
if (location.pathname.endsWith('admin.html')) {
  // 관리자 인증 및 사용자명 표시
  fetch('/me').then(res => res.json()).then(data => {
    if (!data.id || data.role !== 'admin') {
      location.href = 'login.html';
      return;
    }
    document.getElementById('adminUserInfo').innerText = `${data.id}님`;
  });
  // 사용자 목록 렌더링
  function renderUserTable() {
    fetch('/users').then(res => res.json()).then(users => {
      const tbody = document.getElementById('adminUserTableBody');
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${u.createdAt || '-'}</td>
          <td>${u.role === 'admin' ? '<span class="admin-role-admin">관리자</span>' : '일반사용자'}</td>
          <td>${u.role === 'admin' ? '' : `<button class='admin-delete-btn' data-id='${u.id}'>삭제</button>`}</td>
        </tr>
      `).join('');
      // 삭제 버튼 이벤트
      document.querySelectorAll('.admin-delete-btn').forEach(btn => {
        btn.onclick = function() {
          const id = this.getAttribute('data-id');
          if (confirm('정말 삭제하시겠습니까?')) {
            fetch(`/users/${id}`, { method: 'DELETE' })
              .then(res => res.json())
              .then(r => { if (r.success) renderUserTable(); });
          }
        };
      });
    });
  }
  renderUserTable();
  // 사용자 생성
  const adminUserForm = document.getElementById('adminUserForm');
  const adminUserFormError = document.getElementById('adminUserFormError');
  const adminUserFormSuccess = document.getElementById('adminUserFormSuccess');
  adminUserForm.onsubmit = async (e) => {
    e.preventDefault();
    adminUserFormError.style.display = 'none';
    adminUserFormSuccess.style.display = 'none';
    const id = document.getElementById('adminNewUserId').value.trim();
    const pw = document.getElementById('adminNewUserPw').value;
    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pw })
      });
      if (!res.ok) throw new Error((await res.json()).error || '생성 실패');
      adminUserFormSuccess.innerText = '사용자 생성 성공!';
      adminUserFormSuccess.style.display = 'block';
      adminUserForm.reset();
      renderUserTable();
    } catch (err) {
      adminUserFormError.innerText = err.message;
      adminUserFormError.style.display = 'block';
    }
  };
  // 로그아웃
  document.getElementById('adminLogoutBtn').onclick = logout;
}


// 대시보드에서 관리자만 사용자 등록 버튼 보이기
if (document.getElementById('registerUserBtn')) {
  fetch('/me', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      if (data && data.role === 'admin') {
        document.getElementById('registerUserBtn').style.display = '';
      } else {
        document.getElementById('registerUserBtn').style.display = 'none';
      }
    })
    .catch(() => {
      document.getElementById('registerUserBtn').style.display = 'none';
    });
  document.getElementById('registerUserBtn').onclick = function() {
    location.href = 'register.html';
  };
} 