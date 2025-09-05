/** =========================================================
 *  공통 유틸/헬퍼
 *  - DOM 헬퍼, fetch 래퍼, 안전 문자열, 본문 표시
 * ======================================================= */
const $  = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from(p.querySelectorAll(s));

async function safeJson(r){ try { return await r.json(); } catch { return null; } }
async function j(url, opt={}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type':'application/json', ...(opt.headers||{}) },
    ...opt
  });
  if (!res.ok) throw { status: res.status, body: await safeJson(res) };
  return safeJson(res);
}
function unhideBody() {
  document.body.classList.remove('hidden');
  document.body.style.removeProperty('display');
}
function escapeHtml(s=''){
  return s.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/** =========================================================
 *  블로그 URL 필터 (네이버 본문만 추출)
 * ======================================================= */
function isRealBlogPost(url) {
  if (!url) return false;
  return /^https?:\/\/(?:blog|m\.blog)\.naver\.com\/(?:[^/]+\/\d+|PostView\.naver\?blogId=[^&]+&logNo=\d+)/.test(url);
}

/** topReferers 객체에서 네이버 본문 1순위 뽑기 */
function bestBlogFromTopReferers(topReferers){
  if (!topReferers || typeof topReferers !== 'object') return null;
  const best = Object.entries(topReferers)
    .filter(([u]) => isRealBlogPost(u))
    .sort((a,b)=> b[1]-a[1])[0];
  return best ? best[0] : null;
}

/** =========================================================
 *  공용 액션: 이미지 미리보기 모달, 클립보드 복사
 * ======================================================= */
window.openImagePreview = function(url){
  const wrap = $('#img-modal'), img = $('#img-modal-img');
  if (!wrap || !img) return;
  img.src = url;
  wrap.classList.remove('hidden');
};
document.addEventListener('click', (e)=>{
  const wrap = $('#img-modal');
  if (wrap && !wrap.classList.contains('hidden') && e.target === wrap) {
    $('#img-modal-img').src = '';
    wrap.classList.add('hidden');
  }
});
window.copyText = async function(text){
  try { await navigator.clipboard.writeText(text); } catch {}
};

/** =========================================================
 *  인덱스 페이지(index.html)
 *  - 단일 이미지+메모 업로드
 *  - 결과 URL/메모 표시, URL 복사, 이미지 미리보기
 * ======================================================= */
(function initIndexPage(){
  const form = $('#uploadForm');
  if (!form) return;

  const resultDiv  = $('#result');
  const previewDiv = $('#preview');
  let previewUrl   = '';

  if (resultDiv)  resultDiv.style.display  = 'none';
  if (previewDiv) previewDiv.style.display = 'none';

  $('#imageInput').onchange = (e)=>{
    const file = e.target.files[0];
    if (file) {
      previewDiv.textContent = file.name;
      previewDiv.style.display = '';
      previewUrl = URL.createObjectURL(file);
    } else {
      previewDiv.textContent = '';
      previewDiv.style.display = 'none';
      previewUrl = '';
    }
  };

  form.onsubmit = async (e)=>{
    e.preventDefault();
    const formData = new FormData(e.target);
    const memoInput = $('input[name="memo"]');
    if (memoInput) formData.set('memo', memoInput.value);

    try {
      const res  = await fetch('/upload', { method:'POST', body: formData, credentials: 'include' });
      const data = await res.json();

      const file   = $('#imageInput').files[0];
      const imgTag = file ? `<div style="text-align:center;"><img src="${previewUrl}" class="result-img" alt="업로드 이미지" id="result-img-thumb"></div>` : '';
      const url    = data.url || (data.urls && data.urls[0]);
      const memo   = data.memo || (data.memos && data.memos[0]) || '';
      const urlAbs = url ? `${location.origin}${url}` : '';

      resultDiv.innerHTML = `
        <div class="result-box">
          ${imgTag}
          <div class="result-info">
            <div class='result-url-row'>
              <span class='result-url'><span style="color:#1877f2;font-weight:bold;">URL&nbsp;</span>
                <a href="${url}" target="_blank">${urlAbs}</a>
              </span>
              <button class='copy-btn' id='copy-url-btn' type='button'>복사</button>
            </div>
            <div class='result-memo'><span style="color:#1877f2;font-weight:bold;">메모:</span> ${escapeHtml(memo)}</div>
          </div>
        </div>`;
      resultDiv.style.display = '';

      $('#copy-url-btn').onclick = function(){
        const u = this.parentNode.querySelector('a').href;
        navigator.clipboard.writeText(u).then(()=>{
          this.textContent = '✅';
          setTimeout(()=> this.textContent='복사', 1200);
        });
      };
      if (file) $('#result-img-thumb').onclick = ()=> openImagePreview(previewUrl);
    } catch (err) {
      console.error('Upload error:', err);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    }
  };
})();


// ===== 결과 렌더러: 작은 미리보기 + 스크롤 리스트 + 전체복사 =====
function renderCompactResult({ mount, imageUrl, items }) {
  if (!mount) mount = document.getElementById('multiMemoResult') || document.getElementById('result');

  const html = `
    <div class="result-box">
      <div class="result-header" style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px;">
        <img src="${imageUrl}" alt="미리보기" class="result-img"
             style="max-width:200px;max-height:140px;width:100%;border-radius:10px;object-fit:cover;margin:0;">
        <div class="result-actions" style="display:flex;gap:8px;">
          <button type="button" class="copy-all-btn"
                  style="height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);
                         background:#111827;color:#fff;font-weight:800;cursor:pointer;">
            전체 복사
          </button>
        </div>
      </div>

      <div class="result-list" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);
                                      max-height:260px;overflow:auto;padding-right:6px;">
        ${items.map(it => `
          <div class="result-url-row"
               style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:6px 0;">
            <span class="label" style="color:var(--muted);font-weight:600;">URL ${it.index}:</span>
            <a href="${it.url}" target="_blank" rel="noopener"
               style="min-width:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${it.url}
            </a>
            <button type="button" class="copy-btn" data-copy="${it.url}"
                    style="height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--line);
                           background:#111827;color:#fff;font-weight:700;cursor:pointer;">복사</button>
          </div>
          ${it.memo ? `<div class="result-memo" style="color:#374151;padding:0 0 6px 0;"><b style="color:var(--brand)">메모:</b> ${escapeHtml(it.memo)}</div>` : ''}
        `).join('')}
      </div>
    </div>
  `;

  mount.innerHTML = html;

  mount.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(text).then(() => flash(btn));
    });
  });

  const allBtn = mount.querySelector('.copy-all-btn');
  allBtn?.addEventListener('click', () => {
    const all = items.map(i => i.url).join('\n');
    navigator.clipboard.writeText(all).then(() => flash(allBtn));
  });

  function flash(el){
    const old = el.textContent;
    el.textContent = '✅';
    setTimeout(() => el.textContent = old, 900);
  }
}


/** =========================================================
 *  대시보드 페이지(dashboard.html)
 *  - 목록/썸네일/메모/소유자/복사/삭제/자세히 보기/이미지 교체
 *  - 엑셀 다운로드
 * ======================================================= */
(function initDashboardPage(){
  const tbody = $('#dashboard-tbody');
  if (!tbody) return;

  let currentImgId = null;

  (async function init(){
    try {
      const me = await j('/me');
      unhideBody();

      const userInfo = $('#userInfo');
      if (userInfo) userInfo.textContent = me.role === 'admin' ? `관리자 ${me.id}` : me.id;

      const logoutBtn = $('#logoutBtn');
      if (logoutBtn) logoutBtn.onclick = async () => { await j('/logout', { method:'POST' }); location.href='login.html'; };

      const excelBtn = $('#excelDownload');
      if (excelBtn) {
        excelBtn.onclick = async ()=>{
          try {
            const res  = await fetch('/dashboard-excel', { credentials:'include' });
            if (!res.ok) throw new Error('엑셀 다운로드 실패');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            const uid  = (userInfo?.textContent || '').trim();
            a.href = url; a.download = (uid ? `${uid}_` : '') + 'dashboard.xlsx';
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          } catch(e){ alert('엑셀 다운로드 중 오류가 발생했습니다.'); }
        };
      }

      const regBtn = $('#registerUserBtn');
      if (regBtn) {
        if (me.role === 'admin') { regBtn.style.display = ''; regBtn.onclick = ()=> location.href='register.html'; }
        else regBtn.style.display = 'none';
      }

      const data = await j('/dashboard-data');
      data.sort((a,b)=>{
        const aid = Number(a.id || a.filename?.replace(/\D/g,'')); 
        const bid = Number(b.id || b.filename?.replace(/\D/g,''));
        return (bid||0)-(aid||0);
      });
      renderRows(data);
    } catch (e) {
      if (e?.status === 401) location.href='login.html';
      else { console.error(e); alert('대시보드를 불러오지 못했습니다.'); }
    }
  })();

  function renderRows(data){
    const changeBtn = $('#img-change-btn');
    if (changeBtn) {
      changeBtn.onclick = ()=>{
        if (!currentImgId) { alert('대상 이미지를 찾을 수 없습니다.'); return; }
        const input = $(`#file-${currentImgId}`);
        if (!input) { alert('파일 선택기를 찾을 수 없습니다.'); return; }
        input.onchange = ()=> replaceImage(currentImgId);
        input.click();
      };
    }

    const closeBtn = $('#img-close-btn');
    if (closeBtn) {
      closeBtn.onclick = ()=>{
        const wrap = $('#img-modal'), img = $('#img-modal-img');
        if (img)  img.src = '';
        if (wrap) wrap.classList.add('hidden');
      };
    }

    tbody.innerHTML = data.map((img, idx)=>{
      const imgUrl   = img.url || `/image/${img.id}`;
      const imgId    = (img.url ? img.url.split('/').pop() : img.id);
      const fullUrl  = `${location.origin}${imgUrl}`;
      const thumbUrl = `/image/${imgId}?dashboard=1`;

      // 대표 블로그 링크: 1) 서버가 준 blogUrl, 2) topReferers에서 계산
      let blogHref = img.blogUrl || bestBlogFromTopReferers(img.topReferers) || '';

      return `
        <tr data-id="${imgId}">
          <td>
            <img src="${thumbUrl}" alt="img" class="dashboard-img-thumb" id="thumb-${imgId}" data-img-url="${thumbUrl}">
            <br>
            <input type="file" id="file-${imgId}" style="display:none">
          </td>

          <!-- URL 스택: 이미지 URL + 블로그 URL(있으면) -->
          <td class="td-urlstack">
            <div class="url-row">
              <button class="dashboard-copy-btn" data-url="${fullUrl}">복사</button>
              <a class="dashboard-url-link" href="${fullUrl}" target="_blank" title="${fullUrl}">${fullUrl}</a>
            </div>
            <div class="url-row">
              ${
                blogHref
                  ? `<button class="dashboard-copy-btn" data-url="${blogHref}">복사</button>
                     <a class="dashboard-blog-link" href="${blogHref}" target="_blank" title="${blogHref}">${blogHref}</a>`
                  : `<span class="url-empty">-</span>`
              }
            </div>
          </td>

          <td class="memo-td">${escapeHtml(img.memo || '-')}</td>
          <td><button class="dashboard-btn-blue" data-detail="${idx}">보기</button></td>
          <td><button class="dashboard-btn-red"  data-del="${imgId}">삭제</button></td>
        </tr>`;
    }).join('');

    // 복사
    $$('.dashboard-copy-btn', tbody).forEach(btn=>{
      btn.onclick = ()=>{
        const url = btn.getAttribute('data-url');
        if (!url) return;
        copyText(url);
        btn.textContent = '✅';
        setTimeout(()=> btn.textContent = '복사', 1000);
      };
    });

    // 삭제
    $$('.dashboard-btn-red', tbody).forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-del');
        if (!id) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try{
          const r = await j(`/image/${id}`, { method:'DELETE' });
          if (r?.success) btn.closest('tr')?.remove();
        }catch{ alert('삭제 실패'); }
      };
    });

    // 썸네일 미리보기
    $$('.dashboard-img-thumb', tbody).forEach(imgEl=>{
      imgEl.onclick = ()=>{
        const m = (imgEl.id || '').match(/^thumb-(.+)$/);
        currentImgId = m ? m[1] : null;
        openImagePreview(imgEl.dataset.imgUrl);
      };
    });

    // 상세보기
    $$('.dashboard-btn-blue[data-detail]', tbody).forEach(btn=>{
      btn.onclick = ()=> openDetail(data[Number(btn.getAttribute('data-detail'))]);
    });
  }

  // 이미지 교체 (POST /replace-image)
  window.replaceImage = async function(imgId){
    const fileInput = $(`#file-${imgId}`);
    const file = fileInput?.files?.[0];
    if (!file) return alert('파일이 선택되지 않았습니다.');

    const formData = new FormData();
    formData.append('image', file);
    formData.append('id', imgId);

    try{
      const res = await fetch('/replace-image', { method:'POST', body: formData, credentials:'include' });
      const data = await res.json();
      if (data.success) {
        const t = $(`#thumb-${imgId}`);
        if (t) t.src = data.newUrl + `?t=${Date.now()}`;
        alert('이미지가 성공적으로 변경되었습니다.');
      } else {
        alert('이미지 변경 실패: ' + (data.error||''));
      }
    }catch(e){ alert('서버 오류 발생'); }
  };

    // 상세 모달
  async function openDetail(img){
    // topReferers에서 가장 많이 불러간 블로그 URL 추출(네이버 본문만)
    function bestBlogFromTopReferers(top){
      if (!top || typeof top !== 'object') return null;
      const cand = Object.entries(top)
        .filter(([u]) => isRealBlogPost(u))
        .sort((a,b)=> b[1]-a[1]);
      return (cand[0] && cand[0][0]) || null;
    }

    try{
      const detail = await j(`/image/${img.id}/detail`);
      const modal  = $('#modal');
      const body   = $('#modal-body');

      // 서버 값 우선, 없으면 집계에서 선정
      const blogUrl = detail.blogUrl || bestBlogFromTopReferers(detail.topReferers) || '-';

      // visitors(IP/UA/방문수/visits[])
      const ipRows = (detail.visitors||[]).map(x=>{
        const ipv4 = (x.ip||'').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        return `<tr>
          <td class="ip-cell">${ipv4 ? ipv4[0] : escapeHtml(x.ip||'')}</td>
          <td class="text-left">${escapeHtml(x.ua||'-')}</td>
          <td>${x.count||0}</td>
        </tr>`;
      }).join('');

      // 본문 구성
      body.innerHTML = `
        <div class="modal-title-row-main">
          <div class="modal-title-filename">${escapeHtml(detail.filename||'')}</div>
          <div class="modal-actions">
            <button id="showDaily" class="dashboard-btn-blue btn-32 btn-w-96">방문일자</button>
            <button id="downloadDetail" class="dashboard-btn-blue btn-32 btn-w-120 btn-success">엑셀 다운로드</button>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-row">
            <span class="modal-label">총 방문수</span>
            <span class="modal-value">${detail.views||0}</span>
          </div>
          <div class="modal-row">
            <span class="modal-label">오늘 방문</span>
            <span class="modal-value">${detail.todayVisits||0}</span>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-row">
            <span class="modal-label">블로그 주소</span>
            <span class="modal-value">${
              blogUrl==='-'
                ? '-'
                : `<a href="${blogUrl}" target="_blank" class="dashboard-blog-link">${blogUrl}</a>`
            }</span>
          </div>
        </div>

        <div class="modal-table-wrap">
          <table class="modal-table">
            <thead><tr><th>IP</th><th>User-Agent</th><th>방문수</th></tr></thead>
            <tbody>${ipRows || `<tr><td colspan="3">접속 기록 없음</td></tr>`}</tbody>
          </table>
        </div>
      `;

      // 모달 열기
      modal.classList.remove('hidden');
      modal.setAttribute('tabindex','-1');
      modal.focus();

      // 공용 닫기 함수
      const closeModal = ()=>{
        modal.classList.add('hidden');
        body.innerHTML = '';
        modal.removeEventListener('click', onOverlayClick);
        modal.removeEventListener('keydown', onKey);
      };

      // 배경 클릭으로 닫기 (카드 외부만)
      const onOverlayClick = (e)=>{ if (e.target === modal) closeModal(); };
      modal.addEventListener('click', onOverlayClick);

      // ESC 로 닫기
      const onKey = (e)=>{ if (e.key === 'Escape') closeModal(); };
      modal.addEventListener('keydown', onKey);

      // 방문일자 표 생성
      $('#showDaily').onclick = async ()=>{
        try {
          const r = await j(`/image/${detail.id}/daily-visits`);
          const rows = (r.dailyVisits||[])
            .map(v=>`<tr><td>${v.date}</td><td>${v.count}</td></tr>`).join('');
          $('#modal-body').innerHTML += `
            <div class="modal-section">
              <div class="modal-table-wrap">
                <table class="modal-table">
                  <thead><tr><th>날짜</th><th>방문수</th></tr></thead>
                  <tbody>${rows || `<tr><td colspan="2">일자별 방문 기록 없음</td></tr>`}</tbody>
                </table>
              </div>
            </div>`;
        } catch(e){ alert('방문일자를 불러오지 못했습니다.'); }
      };

      // 엑셀 다운로드(개별)
      $('#downloadDetail').onclick = async ()=>{
        if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리가 로드되지 않았습니다.'); return; }
        let dailyVisits = [];
        try {
          const r = await j(`/image/${detail.id}/daily-visits`);
          dailyVisits = r.dailyVisits || [];
        } catch {}

        const dailySheet = [['블로그 링크','총 방문수','날짜','방문수'],
          ...dailyVisits.map((row,i)=>[i? '' : (blogUrl||'-'), i? '' : (detail.views||0), row.date, row.count])];

        const userSheet = [['IP','User-Agent','유저 방문수','방문 시각(시:분:초)']];
        (detail.visitors||[]).forEach(row=>{
          const visitTimes = (row.visits||[])
            .map(v=>v.time ? v.time.replace('T',' ').slice(0,19) : '')
            .filter(Boolean).join('\n');
          userSheet.push([row.ip, row.ua, row.count, visitTimes]);
        });

        const wb = XLSX.utils.book_new();
        const wsDaily = XLSX.utils.aoa_to_sheet(dailySheet);
        const wsUser  = XLSX.utils.aoa_to_sheet(userSheet);
        wsDaily['!cols'] = [{wch:60},{wch:12},{wch:14},{wch:10}];
        wsUser['!cols']  = [{wch:18},{wch:40},{wch:10},{wch:28}];
        XLSX.utils.book_append_sheet(wb, wsDaily, '날짜별 방문수');
        XLSX.utils.book_append_sheet(wb, wsUser,  '유저별 상세');
        const memoSafe = (img.memo || detail.memo || '미입력').replace(/[<>:"/\\|?*]/g,'_');
        XLSX.writeFile(wb, `${memoSafe}.xlsx`);
      };

    } catch (e) {
      console.error(e);
      alert('상세 정보를 불러오지 못했습니다.');
    }
  }

})();

/** =========================================================
 *  전역 네비게이션 버튼
 * ======================================================= */
(function navButtons(){
  const dashBtn = $('#dashboardBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      try { await j('/me'); location.href='dashboard.html'; }
      catch { location.href='login.html'; }
    });
  }
  const multiBtn = $('#multiMemoBtn');
  if (multiBtn) {
    multiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = 'multi-memo.html';
    });
  }
})();

/** =========================================================
 *  관리자 페이지(admin.html) - admin-body
 * ======================================================= */
(function initAdminPage(){
  if (!document.body || !document.body.classList.contains('admin-body')) return;

  const usersTableBody    = document.querySelector('#usersTableBody');
  const createUserForm    = document.querySelector('#createUserForm');
  const createUserMessage = document.querySelector('#createUserMessage');

  const PW_CACHE_KEY = 'hw_pw_cache_v1';
  const loadPwCache = () => {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(PW_CACHE_KEY) || '{}'))); }
    catch { return new Map(); }
  };
  const savePwCache = (map) => {
    localStorage.setItem(PW_CACHE_KEY, JSON.stringify(Object.fromEntries(map)));
  };
  const pwCache = loadPwCache();

  async function getJSON(url, opt = {}) {
    const res = await fetch(url, {
      credentials:'include',
      headers:{ Accept:'application/json', ...(opt.headers||{}) },
      ...opt
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : null;
    if (!res.ok) throw new Error((data && (data.error||data.message)) || `HTTP ${res.status}`);
    return data;
  }

  const showMessage = (msg, ok) => {
    if (!createUserMessage) return;
    createUserMessage.textContent = msg;
    createUserMessage.className   = ok ? 'success-message' : 'error-message';
    setTimeout(()=>{ createUserMessage.textContent=''; createUserMessage.className=''; }, 3000);
  };

  (async ()=>{
    try { const me = await getJSON('/me'); if (!me.id || me.role!=='admin') location.href='login.html'; }
    catch { location.href='login.html'; }
  })();

  async function loadUsers(){
    const users = await getJSON('/users');
    usersTableBody.innerHTML = '';

    users.forEach(u=>{
      const tr = document.createElement('tr');

      const roleHtml = (u.role==='admin')
        ? `<span class="role-badge role-badge--admin">관리자</span>`
        : `<span class="role-badge">일반사용자</span>`;

      let pwCellHTML = '<span class="muted">—</span>';
      if (u.role !== 'admin') {
        const plain = pwCache.get(u.id);
        if (plain) {
          pwCellHTML = `
            <div class="pw-wrap" data-user="${u.id}" data-plain="${escapeHtml(plain)}">
              <span class="pw-value" data-show="true">${escapeHtml(plain)}</span>
            </div>`;
        } else {
          pwCellHTML = `<button class="pw-reset-btn" data-reset="${u.id}">초기화</button>`;
        }
      }

      const manageCell = (u.role==='admin')
        ? `<span class="muted">—</span>`
        : `<button class="delete-btn" data-id="${u.id}">삭제</button>`;

      tr.innerHTML = `
        <td>${u.id}</td>
        <td class="pw-cell">${pwCellHTML}</td>
        <td>${roleHtml}</td>
        <td>${manageCell}</td>
      `;
      usersTableBody.appendChild(tr);
    });

    usersTableBody.querySelectorAll('.pw-wrap').forEach(wrap=>{
      const plain = wrap.dataset.plain || '';
      const span  = wrap.querySelector('.pw-value');
      wrap.addEventListener('click', e=>{
        const act = e.target?.dataset?.action;
        if (!act) return;
        if (act==='toggle'){
          const showing = span.getAttribute('data-show')==='true';
          if (showing){
            span.textContent = '••••••••';
            span.setAttribute('data-show','false');
            e.target.textContent = '보기';
          }else{
            span.textContent = plain;
            span.setAttribute('data-show','true');
          }
        }
        if (act==='copy'){
          if (!plain) return;
          navigator.clipboard.writeText(plain).then(()=>{
            e.target.textContent='✅'; setTimeout(()=> e.target.textContent='복사',900);
          });
        }
      });
    });

    usersTableBody.querySelectorAll('.delete-btn').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute('data-id');
        if (!confirm(`'${id}' 사용자를 삭제할까요?`)) return;
        try{
          const r = await getJSON(`/users/${encodeURIComponent(id)}`, { method:'DELETE' });
          if (r.success){ pwCache.delete(id); savePwCache(pwCache); btn.closest('tr')?.remove(); }
          else alert(r.error||'삭제 실패');
        }catch(e){ alert(e.message||'삭제 실패'); }
      };
    });
  }

  if (createUserForm){
    createUserForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      createUserMessage.textContent='';
      const id = document.querySelector('#newUsername').value.trim();
      const pw = document.querySelector('#newPassword').value;
      try{
        const r = await getJSON('/register', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id, pw })
        });
        if (r.success===false) throw new Error(r.error||'생성 실패');
        pwCache.set(id, pw);
        savePwCache(pwCache);
        showMessage('사용자 생성 성공!', true);
        createUserForm.reset();
        await loadUsers();
      }catch(err){ showMessage(err.message, false); }
    });
  }

  loadUsers().catch(e=>alert(e.message||'사용자 목록을 불러오지 못했습니다.'));
})();


// ===== Topbar 로그인 상태 토글 & Dashboard 가드 =====
(function topbarAuthAndGuard(){
  const authLink = document.getElementById('authLink');
  const navDash  = document.getElementById('navDashboard');

  if (authLink) {
    j('/me').then(me => {
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => {
        e.preventDefault();
        try { await j('/logout', { method:'POST' }); }
        finally { location.href = 'login.html'; }
      };
    }).catch(() => {
      authLink.textContent = 'Login';
      authLink.href = 'login.html';
      authLink.onclick = null;
    });
  }

  if (navDash) {
    navDash.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await j('/me'); location.href='dashboard.html'; }
      catch { location.href='login.html'; }
    });
  }
})();


// ===== Topbar: 로그인 상태 반영 + 대시보드 접근 가드 =====
(function initTopbar(){
  const dashLink = document.getElementById('navDashboard');
  const authLink = document.getElementById('authLink');

  j('/me')
    .then(me => {
      if (authLink) {
        authLink.textContent = 'Logout';
        authLink.href = '#';
        authLink.onclick = async (e) => {
          e.preventDefault();
          try { await j('/logout', { method: 'POST' }); } catch {}
          location.href = 'index.html';
        };
      }
    })
    .catch(() => {
      if (authLink) {
        authLink.textContent = 'Login';
        authLink.href = 'login.html';
        authLink.onclick = null;
      }
    });

  if (dashLink) {
    dashLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await j('/me');
        location.href = 'dashboard.html';
      } catch {
        location.href = 'login.html';
      }
    });
  }
})();


// ===== Topbar: 로그인 상태 반영 + 메뉴 가드 =====
(function initTopbar(){
  const userLink = document.getElementById('navUser');
  const dashLink = document.getElementById('navDashboard');
  const authLink = document.getElementById('authLink');

  j('/me')
    .then(me => {
      if (authLink) {
        authLink.textContent = 'Logout';
        authLink.href = '#';
        authLink.onclick = async (e) => {
          e.preventDefault();
          try { await j('/logout', { method: 'POST' }); } catch {}
          location.href = 'index.html';
        };
      }
    })
    .catch(() => {
      if (authLink) {
        authLink.textContent = 'Login';
        authLink.href = 'login.html';
        authLink.onclick = null;
      }
    });

  if (dashLink) {
    dashLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await j('/me');
        location.href='dashboard.html';
      } catch {
        location.href='login.html';
      }
    });
  }

  if (userLink) {
    userLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const me = await j('/me');
        if (me.role === 'admin') {
          location.href = 'register.html';
        } else {
          alert('관리자만 접근할 수 있습니다.');
        }
      } catch {
        location.href = 'login.html';
      }
    });
  }

  /** 헤더 네비 상태/동작 */
  (function initHeaderNav(){
    const dashLink = document.getElementById('dashboardLink');
    const userLink = document.getElementById('userLink');
    const authLink = document.getElementById('authLink');
    const whoami   = document.getElementById('whoami');

    if (!dashLink && !userLink && !authLink && !whoami) return;

    const hideWho = () => { if (whoami){ whoami.textContent=''; whoami.style.display='none'; } };
    const showWho = (id) => { if (whoami){ whoami.textContent = id || ''; whoami.style.display = id ? '' : 'none'; } };

    function wireAsGuest(){
      hideWho();
      if (authLink){
        authLink.textContent = 'Login';
        authLink.onclick = null;
        authLink.setAttribute('href','login.html');
      }
      if (dashLink){
        dashLink.onclick = (e)=>{ e.preventDefault(); location.href='login.html'; };
      }
      if (userLink){
        userLink.onclick = (e)=>{
          e.preventDefault();
          alert('관리자로 로그인해야 접근할 수 있습니다.');
          location.href = 'login.html';
        };
      }
    }

    function wireAsUser(me){
      showWho(me?.id);

      if (authLink){
        authLink.textContent = 'Logout';
        authLink.setAttribute('href','#');
        authLink.onclick = async (e)=>{
          e.preventDefault();
          try { await j('/logout', { method:'POST' }); } catch {}
          location.href = 'index.html';
        };
      }

      if (dashLink){
        dashLink.onclick = (e)=>{ e.preventDefault(); location.href='dashboard.html'; };
      }

      if (userLink){
        userLink.onclick = (e)=>{
          e.preventDefault();
          if (me?.role === 'admin') location.href = 'register.html';
          else alert('관리자만 접근할 수 있습니다.');
        };
      }
    }

    (async ()=>{
      try {
        const me = await j('/me');
        if (!me?.id) return wireAsGuest();
        wireAsUser(me);
      } catch {
        wireAsGuest();
      }
    })();
  })();

})();
