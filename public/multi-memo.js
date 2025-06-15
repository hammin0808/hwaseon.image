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
    for (let i = 0; i < excelMemos.length; i++) {
      const formData = new FormData();
      formData.append('image', files[0]); // 이미지 1개만
      formData.append('memo', excelMemos[i]);
      await fetch('/upload', {
        method: 'POST',
        body: formData
      });
    }
    alert('업로드 완료!');
    window.location.reload();
  };
} 