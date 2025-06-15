const form = document.getElementById('multiMemoForm');
const memoList = document.getElementById('multiMemoList');
const addMemoBtn = document.getElementById('addMultiMemoBtn');
const resultDiv = document.getElementById('multiMemoResult');
const previewDiv = document.getElementById('multiMemoPreview');
const fileInput = document.getElementById('multiMemoImage');
const excelInput = document.getElementById('multiMemoExcel');
const excelNameDiv = document.getElementById('multiMemoExcelName');

// 엑셀 파일에서 메모 추출
let excelMemos = [];
if (excelInput) {
  excelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 파일명 표시
    if (excelNameDiv) {
      excelNameDiv.innerHTML = file.name;
      excelNameDiv.style.display = '';
    }
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

if (fileInput) {
  fileInput.onchange = function(e) {
    const files = Array.from(e.target.files);
    if (files.length) {
      previewDiv.innerHTML = files.map(f => f.name).join('<br>');
      previewDiv.style.display = '';
    } else {
      previewDiv.innerHTML = '';
      previewDiv.style.display = 'none';
    }
  };
}

if (addMemoBtn && memoList) {
  addMemoBtn.onclick = function() {
    const count = memoList.querySelectorAll('input[name="memo"]').length;
    if (count >= 5) return alert('메모는 최대 5개까지 추가할 수 있습니다.');
    const div = document.createElement('div');
    div.className = 'input-group multi-memo-input-group';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '8px';
    div.style.marginBottom = '10px';
    div.style.width = '100%';
    div.innerHTML = `<input type="text" name="memo" placeholder="메모 입력" required style="flex:1;font-size:1.08rem;padding:13px 14px;border-radius:8px;border:1.5px solid #e3e8f0;"> <button type='button' class='multi-memo-remove' style='background:#dc3545;color:#fff;border:none;border-radius:7px;padding:0 10px;font-size:0.93rem;min-width:0;margin-left:8px;cursor:pointer;height:26px;line-height:1;display:flex;align-items:center;justify-content:center;'>삭제</button>`;
    memoList.appendChild(div);
    div.querySelector('.multi-memo-remove').onclick = function() {
      div.remove();
    };
  };
}

// 업로드
if (form) {
  form.onsubmit = async function(e) {
    e.preventDefault();
    const files = fileInput.files;
    if (!files || files.length !== 1) {
      alert('이미지는 1개만 선택하세요.');
      return;
    }
    if (!excelMemos.length) {
      alert('엑셀 파일에서 메모를 추출하지 못했습니다.');
      return;
    }

    const resultDiv = document.getElementById('multiMemoResult');
    resultDiv.innerHTML = '<div style="text-align:center;color:#666;margin:20px 0;">업로드 중...</div>';
    resultDiv.style.display = 'block';

    const results = [];
    for (let i = 0; i < excelMemos.length; i++) {
      const formData = new FormData();
      formData.append('image', files[0]); // 이미지 1개만
      formData.append('memo', excelMemos[i]);
      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        results.push({
          url: data.url || (data.urls && data.urls[0]),
          memo: data.memo || (data.memos && data.memos[0])
        });
      } catch (error) {
        console.error('Upload error:', error);
        results.push({ error: '업로드 실패' });
      }
    }

    // 결과 표시
    const previewUrl = URL.createObjectURL(files[0]);
    let html = `
      <div class="result-box" style="display:flex;flex-direction:column;align-items:center;gap:20px;margin-top:20px;">
        <div style='width:100%;text-align:center;'>
          <img src="${previewUrl}" class="result-img" alt="업로드 이미지" style="max-width:300px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        </div>
        <div class="result-list" style="width:100%;display:flex;flex-direction:column;gap:12px;">
    `;

    results.forEach((result, index) => {
      if (result.error) {
        html += `<div style="color:#dc3545;padding:10px;background:#fff3f3;border-radius:8px;">${index + 1}번째 업로드 실패</div>`;
      } else {
        const urlText = result.url ? `${location.origin}${result.url}` : '';
        html += `
          <div class="result-item" style="background:#f8f9fa;padding:12px;border-radius:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="color:#1877f2;font-weight:bold;">URL ${index + 1}:</span>
              <a href="${result.url}" target="_blank" style="color:#3575e1;text-decoration:none;">${urlText}</a>
              <button class='copy-btn' type='button' style="background:#1877f2;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:0.9em;">복사</button>
            </div>
            <div style="color:#666;font-size:0.95em;">
              <span style="color:#1877f2;font-weight:bold;">메모:</span> ${result.memo || ''}
            </div>
          </div>
        `;
      }
    });

    html += `
        </div>
      </div>
    `;

    resultDiv.innerHTML = html;

    // 복사 버튼 이벤트
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.onclick = function() {
        const url = this.parentNode.querySelector('a').href;
        navigator.clipboard.writeText(url).then(() => {
          this.innerHTML = '✅';
          setTimeout(() => { this.innerHTML = '복사'; }, 1200);
        });
      };
    });

    // 이미지 클릭시 미리보기
    const thumb = resultDiv.querySelector('.result-img');
    thumb.onclick = function() {
      const modal = document.getElementById('img-modal');
      const modalImg = document.getElementById('img-modal-img');
      modalImg.src = previewUrl;
      modal.style.display = 'flex';
    };
  };
} 