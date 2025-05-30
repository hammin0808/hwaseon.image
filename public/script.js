// index.html
if (document.getElementById('uploadForm')) {
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'none';
  const previewDiv = document.getElementById('preview');
  previewDiv.style.display = 'none';
  let previewUrl = '';
  let excelData = null;
  // 엑셀 업로드 핸들러
  const excelInput = document.getElementById('excelInput');
  if (excelInput) {
    excelInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      // xlsx 라이브러리 동적 로드
      if (!window.XLSX) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.onload = () => handleExcel(file);
        document.body.appendChild(script);
      } else {
        handleExcel(file);
      }
      function handleExcel(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          // 첫 행이 헤더라고 가정, [이미지파일명, 메모] 형식
          excelData = rows.slice(1).filter(r => r[0] && r[1]);
          alert(`엑셀에서 ${excelData.length}개 항목을 읽었습니다. 업로드 버튼을 누르면 모두 업로드됩니다.`);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }
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
    const file = document.getElementById('imageInput').files[0];
    const memoTextarea = document.getElementById('memoTextarea');
    const memos = memoTextarea.value.split('\n').map(s => s.trim()).filter(Boolean);
    // 엑셀 업로드가 있으면 엑셀 우선
    if (excelData && excelData.length > 0) {
      // 엑셀의 각 행마다 업로드
      let results = [];
      for (const [imgName, memo] of excelData) {
        if (!file) {
          alert('엑셀 업로드는 이미지 파일을 선택해야 합니다. (같은 파일로 여러 메모 생성)');
          return;
        }
        const formData = new FormData();
        formData.append('image', file);
        formData.append('memo', memo);
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        results.push({ url: data.url, memo: data.memo });
      }
      resultDiv.innerHTML = results.map(r => `<div><a href="${r.url}" target="_blank">${r.url}</a> <span style="color:#888;">${r.memo}</span></div>`).join('');
      resultDiv.style.display = '';
      excelData = null;
      excelInput.value = '';
      return;
    }
    // 여러 줄 메모 입력 시 각 줄마다 업로드
    if (memos.length > 1) {
      let results = [];
      for (const memo of memos) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('memo', memo);
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        results.push({ url: data.url, memo: data.memo });
      }
      resultDiv.innerHTML = results.map(r => `<div><a href="${r.url}" target="_blank">${r.url}</a> <span style="color:#888;">${r.memo}</span></div>`).join('');
      resultDiv.style.display = '';
      return;
    }
    // 기본(단일) 업로드
    const formData = new FormData(e.target);
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    let imgTag = '';
    if (file) {
      imgTag = `<div style='width:100%;text-align:center;'><img src="${previewUrl}" class="result-img" alt="업로드 이미지" id="result-img-thumb"></div>`;
    }
    const urlText = `${location.origin}${data.url}`;
    resultDiv.innerHTML =
      `<div class="result-box" style="display:flex;flex-direction:column;align-items:center;gap:10px;">
        ${imgTag}
        <div class="result-info" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class='result-url-row' style="margin-bottom:4px;display:flex;align-items:center;gap:8px;">
            <span class='result-url'><span style="color:#1877f2;font-weight:bold;">URL  </span> <a href="${data.url}" target="_blank">${urlText}</a></span>
            <button class='copy-btn' id='copy-url-btn' type='button'>복사</button>
          </div>
          <div class='result-memo' style="margin-top:4px;"><span style="color:#1877f2;font-weight:bold;">메모:</span> ${data.memo}</div>
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
// dashboard.html
if (document.getElementById('dashboard-tbody')) {
  fetch('/dashboard-data')
    .then(res => res.json())
    .then(data => {
      // id(숫자) 기준 내림차순 정렬(최신이 위로)
      data.sort((a, b) => {
        const numA = a.url.match(/(\d+)/)?.[0] || '0';
        const numB = b.url.match(/(\d+)/)?.[0] || '0';
        return Number(numB) - Number(numA);
      });
      const tbody = document.getElementById('dashboard-tbody');
      tbody.innerHTML = data.map((img, idx) => {
        const fullUrl = `${location.origin}${img.url}`;
        const thumbUrl = `/image/${img.url.split('/').pop()}?dashboard=1`;
        let mainReferer = '';
        if (img.referers && img.referers.length > 0) {
          const realReferers = img.referers.filter(ref => !/\/(write|edit|compose|admin|preview)/.test(ref.referer));
          if (realReferers.length > 0) {
            mainReferer = realReferers.slice().sort((a,b)=>b.count-a.count)[0].referer;
          }
        }
        return `
          <tr class="dashboard-row" data-id="${img.url.split('/').pop()}">
            <td><img src="${thumbUrl}" alt="img" class="dashboard-img" data-img-url="${thumbUrl}" style="max-width:60px;max-height:60px;"></td>
            <td style="word-break:break-all;"><a href='${fullUrl}' target='_blank' style='color:#1877f2;text-decoration:underline;'>${fullUrl}</a></td>
            <td>${img.memo || ''}</td>
            <td>${img.createdAt ? new Date(img.createdAt).toLocaleString() : '-'}</td>
            <td>${mainReferer ? `<a href='${mainReferer}' target='_blank' style='color:#3575e1;text-decoration:underline;'>${mainReferer}</a>` : '<span style="color:#aaa;">-</span>'}</td>
            <td><button class="dashboard-btn-sm dashboard-detail-btn" data-idx="${idx}">상세보기</button></td>
            <td><button class="dashboard-delete-btn">삭제</button></td>
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
            const d = new Date(dateStr);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
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

          let ipTable = '';
          if (img.ips.length > 0) {
            ipTable = `<table>\n<tr><th>IP</th><th>User-Agent</th><th>방문수</th><th>최초</th><th>최신</th></tr>` +
              img.ips.map(ipinfo => `<tr><td class='ip-cell'>${ipinfo.ip}</td><td style='font-size:0.93em;word-break:break-all;color:#888;'>${ipinfo.ua || '-'}</td><td>${ipinfo.count}</td><td class='date-cell'>${formatDate(ipinfo.firstVisit)}</td><td class='date-cell'>${formatDate(ipinfo.lastVisit)}</td></tr>`).join('') +
              '</table>';
          } else {
            ipTable = '<div style="color:#888;">방문 기록 없음</div>';
          }

          document.getElementById('modal-body').innerHTML =
            `<div style='margin-top:18px;margin-bottom:18px;text-align:right;'><button id='excel-download-btn' style='padding:7px 18px;font-size:1.01em;background:#1877f2;color:#fff;border:none;border-radius:7px;cursor:pointer;'>엑셀 다운로드</button></div>
            <div style='margin-bottom:10px;'><span class='stat-label'>전체 조회수:</span> <span class='stat-value'>${img.views}</span></div><div style='margin-bottom:10px;'><span class='stat-label'>방문자:</span> <span class='stat-value'>${img.unique}</span></div>${refTable}${ipTable}
            `;
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
              // 블로그 표 데이터
              const blogRows = [];
              if (img.referers && img.referers.length > 0) {
                const realReferers = img.referers.filter(ref => !/\/(write|postwrite|edit|compose|admin|preview)/.test(ref.referer));
                realReferers.forEach(ref => {
                  blogRows.push({
                    '블로그 주소': ref.referer,
                    '방문수': ref.count,
                    '최초': formatDate(ref.firstVisit),
                    '최신': formatDate(ref.lastVisit)
                  });
                });
              }
              // IP 표 데이터
              const ipRows = [];
              if (img.ips && img.ips.length > 0) {
                img.ips.forEach(ipinfo => {
                  ipRows.push({
                    'IP': ipinfo.ip,
                    'User-Agent': ipinfo.ua || '-',
                    '방문수': ipinfo.count,
                    '최초': formatDate(ipinfo.firstVisit),
                    '최신': formatDate(ipinfo.lastVisit)
                  });
                });
              }
              // 워크북 생성
              const wb = XLSX.utils.book_new();
              // 스타일 함수
              function styleHeader(ws, ncols) {
                for (let c = 0; c < ncols; c++) {
                  const cell = ws[XLSX.utils.encode_cell({r:0, c})];
                  if (cell) {
                    cell.s = {
                      fill: { fgColor: { rgb: 'D1C4E9' } }, // 연보라
                      font: { bold: true },
                      alignment: { horizontal: 'center', vertical: 'center' }
                    };
                  }
                }
              }
              // 블로그 시트
              if (blogRows.length > 0) {
                const ws1 = XLSX.utils.json_to_sheet(blogRows, {cellStyles:true});
                // 블로그 주소 컬럼만 wch:40, 나머지는 자동
                const blogCols = Object.keys(blogRows[0]).map(k => k === '블로그 주소' ? { wch: 40 } : { wch: Math.max(12, k.length+2, ...blogRows.map(r => (r[k]+'').length+2)) });
                ws1['!cols'] = blogCols;
                styleHeader(ws1, blogCols.length);
                XLSX.utils.book_append_sheet(wb, ws1, '블로그');
              }
              // IP 시트
              if (ipRows.length > 0) {
                const ws2 = XLSX.utils.json_to_sheet(ipRows, {cellStyles:true});
                // User-Agent 컬럼만 wch:30, 나머지는 자동
                const ipCols = Object.keys(ipRows[0]).map(k => k === 'User-Agent' ? { wch: 30 } : { wch: Math.max(12, k.length+2, ...ipRows.map(r => (r[k]+'').length+2)) });
                ws2['!cols'] = ipCols;
                styleHeader(ws2, ipCols.length);
                XLSX.utils.book_append_sheet(wb, ws2, 'IP');
              }
              XLSX.writeFile(wb, `상세정보_${img.filename || ''}.xlsx`);
            }
          };
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
  // 엑셀 다운로드 버튼 이벤트 핸들러 (추가 예정)
  document.getElementById('excel-download-all').onclick = function() {
    // xlsx 라이브러리 동적 로드
    if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = () => downloadAllExcel();
      document.body.appendChild(script);
    } else {
      downloadAllExcel();
    }
    function downloadAllExcel() {
      // fetch로 다시 데이터 받아오기 (정렬 포함)
      fetch('/dashboard-data')
        .then(res => res.json())
        .then(data => {
          data.sort((a, b) => {
            const numA = a.url.match(/(\d+)/)?.[0] || '0';
            const numB = b.url.match(/(\d+)/)?.[0] || '0';
            return Number(numB) - Number(numA);
          });
          // 엑셀용 데이터 가공
          const rows = data.map(img => {
            let mainReferer = '';
            if (img.referers && img.referers.length > 0) {
              const realReferers = img.referers.filter(ref => !/\/(write|edit|compose|admin|preview)/.test(ref.referer));
              if (realReferers.length > 0) {
                mainReferer = realReferers.slice().sort((a,b)=>b.count-a.count)[0].referer;
              }
            }
            return {
              '썸네일': `${location.origin}/image/${img.url.split('/').pop()}?dashboard=1`,
              'URL': `${location.origin}${img.url}`,
              '메모': img.memo || '',
              '생성일': img.createdAt ? new Date(img.createdAt).toLocaleString() : '-',
              '블로그(주요)': mainReferer,
              '전체 조회수': img.views,
              '고유 방문자': img.unique
            };
          });
          const ws = XLSX.utils.json_to_sheet(rows);
          // 썸네일 컬럼은 하이퍼링크로
          for (let i = 2; i <= data.length+1; i++) {
            const cell = ws[`A${i}`];
            if (cell && cell.v) {
              cell.l = { Target: cell.v };
            }
          }
          // 컬럼 너비 지정
          ws['!cols'] = [
            { wch: 18 }, // 썸네일
            { wch: 40 }, // URL
            { wch: 20 }, // 메모
            { wch: 20 }, // 생성일
            { wch: 40 }, // 블로그
            { wch: 12 }, // 전체 조회수
            { wch: 12 }  // 고유 방문자
          ];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '대시보드');
          XLSX.writeFile(wb, `image-host-대시보드.xlsx`);
        });
    }
  };
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