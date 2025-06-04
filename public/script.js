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
    const res = await fetch('/upload', { method: 'POST', body: formData });
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
  };
}
if (document.getElementById('dashboardBtn') && !document.getElementById('dashboard')) {
  document.getElementById('dashboardBtn').onclick = () => {
    location.href = 'dashboard.html';
  };
}
if (document.getElementById('multiMemoBtn')) {
  document.getElementById('multiMemoBtn').onclick = () => {
    location.href = 'multi-memo.html';
  };
}
// dashboard.html
if (document.getElementById('dashboard-tbody')) {
  fetch('/dashboard-data')
    .then(res => res.json())
    .then(data => {
      // 최근에 만든 이미지가 제일 위에 오도록 내림차순 정렬 (id 기준)
      data.sort((a, b) => {
        // id가 숫자형이면 숫자 내림차순, 아니면 filename의 숫자 부분으로 비교
        const aid = Number(a.id || a.filename?.replace(/\D/g, ''));
        const bid = Number(b.id || b.filename?.replace(/\D/g, ''));
        return bid - aid;
      });
      const tbody = document.getElementById('dashboard-tbody');
      tbody.innerHTML = data.map((img, idx) => {
        const fullUrl = `${location.origin}${img.url}`;
        const thumbUrl = `/image/${img.url.split('/').pop()}?dashboard=1`;
        // 블로그(가장 많이 불러간 referer, 실제 글 주소만)
        let mainReferer = '-';
        if (img.referers && img.referers.length > 0) {
          const realReferers = img.referers.filter(ref => isRealBlogPost(ref.referer));
          if (realReferers.length > 0) {
            mainReferer = `<a href='${realReferers[0].referer}' target='_blank' class='dashboard-blog-link'>${realReferers[0].referer}</a>`;
          }
        }
        return `
          <tr data-id="${img.url.split('/').pop()}">
            <td><img src="${thumbUrl}" alt="img" class="dashboard-img-thumb" data-img-url="${thumbUrl}"></td>
            <td><a href="${fullUrl}" target="_blank" class="dashboard-url-link">${fullUrl}</a></td>
            <td>${mainReferer}</td>
            <td style="word-break:break-all;">${img.memo || '-'}</td>
            <td><button class="dashboard-btn-blue dashboard-detail-btn dashboard-btn-wide" data-idx="${idx}">보기</button></td>
            <td><button class="dashboard-btn-red dashboard-btn-wide dashboard-delete-btn">삭제</button></td>
          </tr>
        `;
      }).join('');
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
      // 상세보기 버튼 이벤트
      document.querySelectorAll('.dashboard-detail-btn').forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const idx = this.getAttribute('data-idx');
          const img = data[idx];
          function formatDate(dateStr) {
            // 오전/오후가 포함된 문자열이면 24시간제로 변환
            if (/오전|오후/.test(dateStr)) {
              let [date, time] = dateStr.split(' ');
              let [hh, mm, ss] = time.split(':');
              let hour = parseInt(hh, 10);
              if (dateStr.includes('오후') && hour < 12) hour += 12;
              if (dateStr.includes('오전') && hour === 12) hour = 0;
              return `${date} ${String(hour).padStart(2, '0')}:${mm}:${ss}`;
            }
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0'); // 24시간제
            const min = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
          }
          // 블로그 referer 표
          let refTable = '';
          if (img.referers && img.referers.length > 0) {
            const realReferers = img.referers.filter(ref => isRealBlogPost(ref.referer));
            if (realReferers.length > 0) {
              const ref = realReferers[0];
              refTable = `<div class='modal-table-wrap'><table class='modal-table' style='min-width:340px;width:100%;'><tr><th>블로그 주소</th><th>최초</th></tr>` +
                `<tr><td style='word-break:break-all;'><a href='${ref.referer}' target='_blank' class='dashboard-blog-link'>${ref.referer}</a></td><td>${formatDate(ref.firstVisit)}</td></tr>` +
                '</table></div>';
            } else {
              refTable = `<div class='modal-table-wrap'><div style=\"color:#888;padding:18px 0;text-align:center;\">블로그 기록 없음</div></div>`;
            }
          } else {
            refTable = `<div class='modal-table-wrap'><div style=\"color:#888;padding:18px 0;text-align:center;\">블로그 기록 없음</div></div>`;
          }
          let ipTable = '';
          if (img.ips && img.ips.length > 0) {
            ipTable = `<div class='modal-table-wrap'><table class='modal-table' style='min-width:340px;width:100%;'><tr><th style="white-space:nowrap;">IP</th><th style="white-space:nowrap;">User-Agent</th><th style="white-space:nowrap;">방문수</th></tr>` +
              img.ips.map(ipinfo => `<tr><td style="white-space:normal;word-break:break-all;">${ipinfo.ip}</td><td style='font-size:0.93em;word-break:break-all;color:#888;white-space:normal;'>${ipinfo.ua || '-'}</td><td style="white-space:normal;">${ipinfo.count}</td></tr>`).join('') + '</table></div>';
          } else {
            ipTable = `<div class='modal-table-wrap'><div style="color:#888;padding:18px 0;text-align:center;">방문 기록 없음</div></div>`;
          }
          document.getElementById('modal-body').innerHTML =
            `<div class='modal-title-row modal-title-row-main' style='flex-direction:column;align-items:flex-start;gap:0;'>
              <span class='modal-title-filename' style='font-size:1.13rem;font-weight:bold;color:#1877f2;'>${img.filename || ''}
              <button id='excel-download-btn' class='dashboard-btn-blue' style='font-size:0.97rem;margin-top:20px; margin-bottom:15px; padding:6px 18px;'>엑셀 다운로드</button></span>
              
            </div>
            <div class='modal-section modal-section-main'>
              <div class='modal-row'><span class='modal-label'>업로드일</span><span class='modal-value'>${formatDate(img.createdAt)}</span></div>
              <div class='modal-row'><span class='modal-label'>전체 조회수</span><span class='modal-value'>${img.views}</span></div>
              <div class='modal-row'><span class='modal-label'>고유 방문자</span><span class='modal-value'>${img.unique}</span></div>
            </div>
            <div class='modal-section'>
              <div class='modal-section-title'>블로그 유입 기록</div>
              ${refTable}
            </div>
            <div class='modal-section'>
              <div class='modal-section-title'>IP/UA 방문 기록</div>
              ${ipTable}
            </div>`;
          // 모달 가로 넓게, 스크롤 적용
          const modalBody = document.getElementById('modal-body');
          if (modalBody) {
            modalBody.style.maxHeight = '60vh';
            modalBody.style.overflowY = 'auto';
            modalBody.parentElement.style.width = '720px';
            modalBody.parentElement.style.minWidth = '700px';
          }
          document.getElementById('modal').style.display = 'flex';
          // 엑셀 다운로드 기능
          document.getElementById('excel-download-btn').onclick = function() {
            // xlsx 라이브러리 로드
            if (!window.XLSX) {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
              script.onload = () => downloadExcel();
              document.body.appendChild(script);
            } else {
              downloadExcel();
            }
            function downloadExcel() {
              // 블로그 표 데이터 (블로그 주소 / 전체 방문 수 / 고유 방문자 수 / 블로그 작성일)
              const blogRows = [];
              if (img.referers && img.referers.length > 0) {
                // 전체 방문수, 고유 방문자수, 작성일(최초 방문일)
                const totalVisit = img.referers.reduce((sum, ref) => sum + (ref.count || 0), 0);
                const uniqueVisit = img.ips ? img.ips.length : 0;
                const firstVisit = img.referers.reduce((min, ref) => {
                  if (!min) return ref.firstVisit;
                  return new Date(ref.firstVisit) < new Date(min) ? ref.firstVisit : min;
                }, null);
                blogRows.push({
                  '블로그 주소': img.referers[0].referer,
                  '전체 방문 수': totalVisit,
                  '고유 방문자 수': uniqueVisit,
                  '블로그 작성일': formatDate(firstVisit)
                });
              }
              // User IP 표 데이터 (IP / User-Agent / 방문 수 / 최초 방문일자)
              const ipRows = [];
              if (img.ips && img.ips.length > 0) {
                img.ips.forEach(ipinfo => {
                  ipRows.push({
                    'IP': ipinfo.ip,
                    'User-Agent': ipinfo.ua || '-',
                    '방문 수': ipinfo.count,
                    '최초 방문일자': formatDate(ipinfo.firstVisit)
                  });
                });
              }
              // 워크북 생성
              const wb = XLSX.utils.book_new();
              // 스타일 함수: 헤더에 연보라색, bold, 가운데 정렬
              function styleHeader(ws, ncols) {
                for (let c = 0; c < ncols; c++) {
                  const cell = ws[XLSX.utils.encode_cell({r:0, c})];
                  if (cell) {
                    cell.s = {
                      fill: { fgColor: { rgb: 'D1C4E9' } },
                      font: { bold: true },
                      alignment: { horizontal: 'center', vertical: 'center' }
                    };
                  }
                }
              }
              // 블로그 시트
              if (blogRows.length > 0) {
                const ws1 = XLSX.utils.json_to_sheet(blogRows, {cellStyles:true});
                ws1['!cols'] = [ { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 22 } ];
                styleHeader(ws1, 4);
                XLSX.utils.book_append_sheet(wb, ws1, '블로그');
              }
              // User IP 시트
              if (ipRows.length > 0) {
                const ws2 = XLSX.utils.json_to_sheet(ipRows, {cellStyles:true});
                ws2['!cols'] = [ { wch: 18 }, { wch: 36 }, { wch: 12 }, { wch: 22 } ];
                styleHeader(ws2, 4);
                XLSX.utils.book_append_sheet(wb, ws2, 'User IP');
              }
              XLSX.writeFile(wb, `상세정보_${img.filename || ''}.xlsx`);
            }
          };
        };
      });
      // 이미지 미리보기 모달 이벤트
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
// 이미지 미리보기 모달 이벤트 (이미지 클릭 시)
document.addEventListener('DOMContentLoaded', function() {
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
  // 이미지 모달 닫기: 이미지 외 영역 클릭 시
  const imgModal = document.getElementById('img-modal');
  if (imgModal) {
    imgModal.onclick = function(e) {
      if (e.target === this) {
        this.style.display = 'none';
        document.getElementById('img-modal-img').src = '';
      }
    };
    // 이미지 클릭 시 모달 닫히지 않게
    const modalImg = document.getElementById('img-modal-img');
    if (modalImg) {
      modalImg.onclick = function(e) { e.stopPropagation(); };
    }
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