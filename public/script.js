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
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    let imgTag = '';
    if (file) {
      imgTag = `<div style='width:100%;text-align:center;'><img src="${previewUrl}" class="result-img" alt="업로드 이미지" id="result-img-thumb"></div>`;
    }
    const urlText = `${location.origin}${data.url}`;
    resultDiv.innerHTML =
      `<div class="result-box">${imgTag}<div class="result-info"><div class='result-url-row'><span class='result-url'><span style=\"color:#1877f2;font-weight:bold;\">URL  </span> <a href=\"${data.url}\" target=\"_blank\">${urlText}</a></span><button class='copy-btn' id='copy-url-btn' type='button'>복사</button></div><div class='result-memo'><span style=\"color:#1877f2;font-weight:bold;\">메모:</span> ${data.memo}</div></div></div>`;
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
  };
}
if (document.getElementById('dashboardBtn') && !document.getElementById('dashboard')) {
  document.getElementById('dashboardBtn').onclick = () => {
    location.href = 'dashboard.html';
  };
}
// dashboard.html
if (document.getElementById('dashboard')) {
  fetch('/dashboard-data')
    .then(res => res.json())
    .then(data => {
      document.getElementById('dashboard').innerHTML = data.map((img, idx) => {
        const fullUrl = `${location.origin}${img.url}`;
        const thumbUrl = `/image/${img.url.split('/').pop()}?dashboard=1`;
        // 블로그(가장 많이 불러간 referer, 실제 글 주소만)
        let mainReferer = '';
        if (img.referers && img.referers.length > 0) {
          // 실제 블로그 글 주소만 필터링 (작성/에디터/미리보기 등 제외)
          const realReferers = img.referers.filter(ref => !/\/(write|edit|compose|admin|preview)/.test(ref.referer));
          if (realReferers.length > 0) {
            mainReferer = realReferers.slice().sort((a,b)=>b.count-a.count)[0].referer;
          }
        }
        return `
        <div class="dashboard-info" data-id="${img.url.split('/').pop()}">
          <img src="${thumbUrl}" alt="img" class="dashboard-img" data-img-url="${thumbUrl}">
          <div class="dashboard-details">
            <div class='dashboard-url-row'><span class="dashboard-label">URL </span><button class='dashboard-copy-btn' type='button' data-url='${fullUrl}'>복사</button></div>
            <div class="dashboard-meta" style='word-break:break-all;font-size:0.97em;margin:6px 0 0 0;'><a href='${fullUrl}' target='_blank' style='color:#1877f2;text-decoration:underline;'>${fullUrl}</a></div>
            <div class="dashboard-meta" style="align-items:center;gap:8px;word-break:break-all;white-space:normal;max-width:220px;">
              <span class="dashboard-label">블로그</span>
              ${mainReferer ? `<a href='${mainReferer}' target='_blank' style='color:#3575e1;text-decoration:underline;display:inline-block;word-break:break-all;white-space:normal;max-width:180px;'>${mainReferer}</a>` : '<span style="color:#aaa;">-</span>'}
            </div>
            <div class="dashboard-meta"><span class="dashboard-label">메모:</span> ${img.memo}</div>
            <div class="dashboard-btn-row">
              <button class="dashboard-btn-sm dashboard-detail-btn" data-idx="${idx}">상세보기</button>
              <button class="dashboard-delete-btn">삭제</button>
            </div>
          </div>
        </div>
      `;
      }).join('');
      // 삭제 버튼 이벤트
      document.querySelectorAll('.dashboard-delete-btn').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const card = this.closest('.dashboard-info');
          const id = card.getAttribute('data-id');
          if (confirm('정말 삭제하시겠습니까?')) {
            fetch(`/image/${id}`, { method: 'DELETE' })
              .then(res => res.json())
              .then(r => { if (r.success) card.remove(); });
          }
        };
      });
      // 상세보기 버튼 이벤트
      document.querySelectorAll('.dashboard-detail-btn').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const idx = this.getAttribute('data-idx');
          const img = data[idx];
          function formatDate(dateStr) {
            const d = new Date(dateStr);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
          }
          let ipTable = '';
          if (img.ips.length > 0) {
            ipTable = `<table>\n<tr><th>IP</th><th>방문수</th><th>최초</th><th>최신</th></tr>` +
              img.ips.map(ipinfo => `<tr><td class='ip-cell'>${ipinfo.ip}</td><td>${ipinfo.count}</td><td class='date-cell'>${formatDate(ipinfo.firstVisit)}</td><td class='date-cell'>${formatDate(ipinfo.lastVisit)}</td></tr>`).join('') +
              '</table>';
          } else {
            ipTable = '<div style="color:#888;">방문 기록 없음</div>';
          }
          // referer 표 (상세보기)
          let refTable = '';
          if (img.referers && img.referers.length > 0) {
            // 실제 글 주소만 필터링 (작성탭/에디터/미리보기 등 제외)
            const realReferers = img.referers.filter(ref => !/\/(write|postwrite|edit|compose|admin|preview)/.test(ref.referer));
            if (realReferers.length > 0) {
              refTable = `<table style='margin-top:18px;table-layout:fixed;width:100%;'>\n<tr>
                <th style="width:40%">블로그 주소</th>
                <th style="width:20%">방문수</th>
                <th style="width:20%">최초</th>
                <th style="width:20%">최신</th>
              </tr>` +
                realReferers.map(ref => `
                  <tr>
                    <td style='word-break:break-all;white-space:normal;max-width:320px;max-height:3.6em;overflow-y:auto;'>
                      <a href='${ref.referer}' target='_blank' style='color:#3575e1;text-decoration:underline;display:inline-block;word-break:break-all;white-space:normal;vertical-align:middle;max-width:300px;'>
                        ${ref.referer}
                      </a>
                    </td>
                    <td>${ref.count}</td>
                    <td class='date-cell'>${formatDate(ref.firstVisit)}</td>
                    <td class='date-cell'>${formatDate(ref.lastVisit)}</td>
                  </tr>
                `).join('') +
                '</table>';
            } else {
              refTable = '<div style="color:#888;">블로그 기록 없음</div>';
            }
          } else {
            refTable = '<div style="color:#888;">블로그 기록 없음</div>';
          }
          document.getElementById('modal-body').innerHTML =
            `<div style='margin-bottom:10px;'><span class='stat-label'>전체 조회수:</span> <span class='stat-value'>${img.views}</span></div><div style='margin-bottom:10px;'><span class='stat-label'>방문자:</span> <span class='stat-value'>${img.unique}</span></div>${ipTable}${refTable}`;
          document.getElementById('modal').style.display = 'flex';
        };
      });
      // 이미지 미리보기 모달 이벤트
      document.querySelectorAll('.dashboard-img').forEach(imgEl => {
        imgEl.onclick = function(e) {
          e.stopPropagation();
          const url = this.getAttribute('data-img-url');
          const modal = document.getElementById('img-modal');
          const modalImg = document.getElementById('img-modal-img');
          modalImg.src = url;
          modal.style.display = 'flex';
        };
      });
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
      // 모달 닫기
      document.getElementById('modal-close').onclick = function() {
        document.getElementById('modal').style.display = 'none';
      };
      document.getElementById('modal').onclick = function(e) {
        if (e.target === this) this.style.display = 'none';
      };
    });
}
// 페이지 로드 시 이미지 미리보기 모달 닫기 이벤트 한 번만 등록
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    var imgModal = document.getElementById('img-modal');
    if (imgModal) {
      imgModal.onclick = function(e) {
        if (e.target === this) {
          this.style.display = 'none';
          document.getElementById('img-modal-img').src = '';
        }
      };
    }
  });
} else {
  var imgModal = document.getElementById('img-modal');
  if (imgModal) {
    imgModal.onclick = function(e) {
      if (e.target === this) {
        this.style.display = 'none';
        document.getElementById('img-modal-img').src = '';
      }
    };
  }
} 