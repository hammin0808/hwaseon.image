// 네이버 블로그 본문 URL만 남기는 함수 (최상단에 선언)
function isRealBlogPost(url) {
  if (!url) return false;
  // /아이디/숫자 또는 /PostView.naver?blogId=...&logNo=... 형식 모두 허용
  return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
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
              mainReferer = `<a href='${realReferers[0].referer}' target='_blank' class='dashboard-blog-link' title='${realReferers[0].referer}' style='display:inline-block;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;'>${realReferers[0].referer}</a>`;
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
            <td style="padding:10px 8px;min-width:80px;">
              <img src="${thumbUrl}" alt="img" class="dashboard-img-thumb" id="thumb-${imgId}" data-img-url="${thumbUrl}" style="max-width:44px;max-height:44px;border-radius:7px;box-shadow:0 2px 8px rgba(24,119,242,0.10);"><br>
              <input type="file" id="file-${imgId}" style="display:none" onchange="replaceImage('${imgId}')">
              <button onclick="document.getElementById('file-${imgId}').click()" style="margin-top:6px;">변경</button>
            </td>
            <td style="padding:10px 8px;min-width:220px;max-width:260px;">
              <button class="dashboard-copy-btn" data-url="${fullUrl}">복사</button>
              <a href="${fullUrl}" target="_blank" class="dashboard-url-link" title="${fullUrl}">${fullUrl}</a>
            </td>
            <td style="padding:10px 8px;min-width:120px;max-width:220px;">${mainReferer}</td>
            <td class="memo-td" style="word-break:break-all;padding:10px 8px;min-width:160px;max-width:240px;">${img.memo || '-'}</td>
            <td style="padding:10px 8px;min-width:80px;max-width:120px;text-align:center;">${ownerCell}</td>
            <td style="padding:10px 8px;min-width:60px;max-width:80px;"><button class="dashboard-btn-blue dashboard-detail-btn" data-idx="${idx}">보기</button></td>
            <td style="padding:10px 8px;min-width:60px;max-width:80px;"><button class="dashboard-btn-red dashboard-delete-btn">삭제</button></td>
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
                  const realReferers = detail.referers.filter(ref => isRealBlogPost(ref.referer));
                  if (realReferers.length > 0) {
                    const ref = realReferers[0];
                    blogUrl = `<a href="${ref.referer}" target="_blank" style="color:#3575e1;text-decoration:underline;">${ref.referer}</a>`;
                    blogCreated = formatDate(ref.firstVisit);
                  }
                }
                // 방문수, 오늘 방문수
                const statBlock = `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:#f8faff;border-radius:12px;padding:18px 32px;margin-bottom:18px;">
                    <div style="font-size:1.08rem;"><b>총 방문수</b><div style="color:#1877f2;font-weight:700;font-size:1.25rem;">${detail.views}</div></div>
                    <div style="font-size:1.08rem;"><b>오늘 총 방문수</b><div style="color:#1877f2;font-weight:700;font-size:1.25rem;">${detail.todayVisits}</div></div>
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
                let dailyVisitsTable = '';
                const makeIpTable = () => {
                  if (detail.ips && detail.ips.length > 0) {
                    return `
                      <div style="background:#f8faff;border-radius:12px;padding:18px 32px;">
                        <div style="font-size:1.08rem;font-weight:600;margin-bottom:8px;text-align:left;display:flex;align-items:center;gap:12px;">
                          <button id="show-daily-visits-btn" style="margin-left:6px;padding:2px 4px;font-size:0.98rem;background:#e3e9f7;color:#1877f2;border:none;border-radius:7px;cursor:pointer;">방문일자</button>
                        </div>
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
                    return '<div style="background:#f8faff;border-radius:12px;padding:18px 32px;text-align:center;color:#888;">접속 기록 없음</div>';
                  }
                };
                const makeDailyVisitsTable = (dailyVisits) => {
                  if (!dailyVisits || !dailyVisits.length) {
                    return '<div style="background:#f8faff;border-radius:12px;padding:18px 32px;text-align:center;color:#888;">일자별 방문 기록 없음</div>';
                  }
                  return `
                    <div style="background:#f8faff;border-radius:12px;padding:18px 32px;">
                      <div style="font-size:1.08rem;font-weight:600;margin-bottom:8px;text-align:left;display:flex;align-items:center;">
                        <button id="show-daily-visits-btn" style="margin-left:6px;padding:2px 4px;font-size:0.98rem;background:#e3e9f7;color:#1877f2;border:none;border-radius:7px;cursor:pointer;">접속로그</button>
                      </div>
                      <table style="width:100%;font-size:1.01em;text-align:center;background:#fff;border-radius:8px;overflow:hidden;">
                        <thead>
                          <tr style="background:#f4f6fa;">
                            <th style="padding:8px 0;">날짜</th>
                            <th style="padding:8px 0;">방문수</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${dailyVisits.map(row => `<tr><td style='padding:7px 0;'>${row.date}</td><td style='padding:7px 0;'>${row.count}</td></tr>`).join('')}
                        </tbody>
                      </table>
                    </div>
                  `;
                };
                ipTable = makeIpTable();
                dailyVisitsTable = makeDailyVisitsTable(detail.dailyVisits);
                // 파일명 + 엑셀 버튼 (상단 넉넉한 레이아웃)
                const modalHeader = `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:0 24px 0 24px;margin-bottom:18px;">
                    <div style="font-size:1.22rem;font-weight:700;color:#1877f2;word-break:break-all;">${detail.filename}</div>
                    <button id="excel-download-btn" style="padding:7px 22px;font-size:1.05rem;background:#19c37d;color:#fff;border:none;border-radius:7px;cursor:pointer;margin-left:32px;">엑셀 다운로드</button>
                  </div>
                `;
                // 모달 렌더링 함수(탭 전환 지원)
                function renderModalBody(contentHtml) {
                  document.getElementById('modal-body').innerHTML =
                    `<div style="padding:28px 28px 16px 28px; max-width:750px; margin:0 auto;">
                      ${modalHeader}
                      <hr style="margin:12px 0;">
                      ${statBlock}
                      <hr style="margin:12px 0;">
                      ${blogBlock}
                      <hr style="margin:12px 0;">
                      ${contentHtml}
                    </div>`;
                }
                renderModalBody(ipTable);
                document.getElementById('modal').style.display = 'flex';
                // 방문일자 버튼 이벤트
                setTimeout(() => {
                  const showDailyBtn = document.getElementById('show-daily-visits-btn');
                  if (showDailyBtn) {
                    showDailyBtn.onclick = function() {
                      fetch(`/image/${detail.id}/daily-visits`)
                        .then(res => res.json())
                        .then(result => {
                          dailyVisitsTable = makeDailyVisitsTable(result.dailyVisits);
                          renderModalBody(dailyVisitsTable);
                          // 접속 로그로 돌아가는 버튼 이벤트
                          setTimeout(() => {
                            const showIpBtn = document.getElementById('show-ip-log-btn');
                            if (showIpBtn) {
                              showIpBtn.onclick = function() {
                                renderModalBody(ipTable);
                                // 다시 방문일자 버튼 이벤트 연결
                                setTimeout(() => {
                                  const showDailyBtn2 = document.getElementById('show-daily-visits-btn');
                                  if (showDailyBtn2) showDailyBtn2.onclick = this.onclick;
                                }, 0);
                              };
                            }
                          }, 0);
                        });
                    };
                  }
                }, 0);

                // 엑셀 다운로드 기능(선택)
                document.getElementById('excel-download-btn').onclick = async function() {
                  if (typeof XLSX === 'undefined') {
                    alert('엑셀 라이브러리가 로드되지 않았습니다.');
                    return;
                  }
                  // detail 객체는 현재 모달에 표시된 데이터와 동일
                  // 1. 날짜별 방문수 시트
                  let dailyVisits = [];
                  try {
                    const res = await fetch(`/image/${detail.id}/daily-visits`);
                    if (res.ok) {
                      const result = await res.json();
                      dailyVisits = result.dailyVisits || [];
                    }
                  } catch (e) {}
                  const blogUrl = detail.blogUrl || '-';
                  const totalViews = detail.views || 0;
                  // 날짜별 방문수 시트: [블로그 링크, 총 방문수, 날짜, 방문수]
                  const dailySheet = [
                    ['블로그 링크', '총 방문수', '날짜', '방문수'],
                    ...dailyVisits.map((row, idx) => [
                      idx === 0 ? blogUrl : '',
                      idx === 0 ? totalViews : '',
                      row.date,
                      row.count
                    ])
                  ];
                  // 2. 유저별 상세 시트
                  const userSheet = [
                    ['IP', 'User-Agent', '유저 방문수', '방문 시각(시:분:초)']
                  ];
                  (detail.ips || []).forEach(row => {
                    // 방문 시각을 \n(줄바꿈)으로 구분
                    const visitTimes = (row.visits || [])
                      .map(v => v.time ? v.time.replace('T', ' ').slice(0, 19) : '')
                      .filter(Boolean)
                      .join('\n');
                    userSheet.push([
                      row.ip,
                      row.ua,
                      row.count,
                      visitTimes
                    ]);
                  });
                  // 워크북 생성
                  const wb = XLSX.utils.book_new();
                  const wsDaily = XLSX.utils.aoa_to_sheet(dailySheet);
                  const wsUser = XLSX.utils.aoa_to_sheet(userSheet);
                  // 컬럼 너비 설정
                  wsDaily['!cols'] = [
                    { wch: 60 }, // 블로그 링크
                    { wch: 12 }, // 총 방문수
                    { wch: 14 }, // 날짜
                    { wch: 10 }  // 방문수
                  ];
                  wsUser['!cols'] = [
                    { wch: 18 }, // IP
                    { wch: 40 }, // User-Agent
                    { wch: 10 }, // 유저 방문수
                    { wch: 24 }  // 방문 시각(시:분:초)
                  ];
                  XLSX.utils.book_append_sheet(wb, wsDaily, '날짜별 방문수');
                  XLSX.utils.book_append_sheet(wb, wsUser, '유저별 상세');
                  // 3번째 시트 없음
                  // 파일명 지정
                  let latestDate = '';
                  if (dailyVisits.length > 0) {
                    // 날짜 내림차순 정렬 후 첫 번째(최신)
                    const sortedDates = dailyVisits.map(r => r.date).sort().reverse();
                    latestDate = sortedDates[0] || '';
                  }
                  let dateStr = '';
                  if (latestDate) {
                    // YY.MM.DD 형식으로 변환
                    const d = latestDate.split('-');
                    if (d.length === 3) dateStr = `${d[0].slice(2)}.${d[1]}.${d[2]}`;
                  }
                  let memoStr = detail.memo;
                  if (!memoStr) {
                    // 대시보드 테이블에서 해당 id의 memo를 찾아서 사용
                    const row = document.querySelector(`tr[data-id="${detail.id}"]`);
                    if (row) {
                      const memoCell = row.querySelector('.memo-td');
                      if (memoCell) memoStr = memoCell.innerText.trim();
                    }
                  }
                  memoStr = memoStr ? memoStr.replace(/[<>:"/\\|?*]/g, '_') : '미입력';
                  let fileName = memoStr;
                  if (dateStr) fileName += (memoStr ? '-' : '') + dateStr;
                  if (!fileName) fileName = 'blog_image_stats';
                  XLSX.writeFile(wb, `${fileName}.xlsx`);
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

const excelBtn = document.getElementById('excelDownload');
if (excelBtn) {
  excelBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/dashboard-excel');
        if (!response.ok) {
            throw new Error('엑셀 다운로드 실패');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 로그인한 아이디 가져오기
        const userInfo = document.getElementById('userInfo') ? document.getElementById('userInfo').textContent.trim() : '';
        const fileName = userInfo ? `${userInfo}_dashboard.xlsx` : 'dashboard_data.xlsx';
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('엑셀 다운로드 오류:', error);
        alert('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  });
}

// 엑셀 파일에서 메모 추출
let excelMemos = [];
const memoExcelInput = document.getElementById('memoExcel');
if (memoExcelInput) {
  memoExcelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // 첫 행이 '메모'일 경우 헤더로 간주하고 제외
      if (rows.length && rows[0][0] && rows[0][0].toString().includes('메모')) rows.shift();
      excelMemos = rows.map(r => r[0] ? r[0].toString() : '');
    };
    reader.readAsArrayBuffer(file);
  });
}

// 업로드 버튼 클릭 시 이미지와 메모 매칭
const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn) {
  uploadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const imageInput = document.getElementById('imageInput');
    const files = imageInput.files;
    if (!files || !files.length) {
      alert('이미지를 선택하세요.');
      return;
    }
    if (excelMemos.length !== files.length) {
      alert('엑셀의 메모 개수와 이미지 개수가 다릅니다.');
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('image', files[i]);
      formData.append('memo', excelMemos[i]);
      await fetch('/upload', {
        method: 'POST',
        body: formData
      });
    }
    alert('업로드 완료!');
    window.location.reload();
  });
} 

function replaceImage(id) {
  const input = document.getElementById("fileInput-" + id);
  const file = input.files[0];
  if (!file) {
    alert("이미지를 선택하세요.");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  fetch(`/image/${id}/replace`, {
    method: "POST",
    body: formData
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert("✅ 이미지 교체 완료");
        const img = document.getElementById("img-" + id);
        img.src = data.newUrl + "?t=" + Date.now(); // 캐시 우회
      } else {
        alert("❌ 실패: " + data.error);
      }
    })
    .catch((err) => {
      alert("요청 오류: " + err.message);
    });
}


function replaceImage(imgId) {
  const fileInput = document.getElementById(`file-${imgId}`);
  const file = fileInput.files[0];
  if (!file) return alert('파일을 선택하세요');

  const formData = new FormData();
  formData.append('image', file);     // ✅ 이미지 파일
  formData.append('id', imgId);       // ✅ 중요! 서버가 이걸 받아야 함

  fetch('/replace-image', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const imgTag = document.getElementById(`thumb-${imgId}`);
      imgTag.src = data.newUrl + `?t=${Date.now()}`;
      alert('이미지가 변경되었습니다.');
    } else {
      alert('이미지 변경 실패: ' + data.error);
    }
  })
  .catch(err => {
    console.error(err);
    alert('서버 오류 발생');
  });
}
