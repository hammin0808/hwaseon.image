const form = document.getElementById('multiMemoForm');
const memoList = document.getElementById('multiMemoList');
const addMemoBtn = document.getElementById('addMultiMemoBtn');
const resultDiv = document.getElementById('multiMemoResult');
const previewDiv = document.getElementById('multiMemoPreview');
const fileInput = document.getElementById('multiMemoImage');

fileInput.onchange = function(e) {
  const file = e.target.files[0];
  if (file) {
    previewDiv.innerHTML = file.name;
    previewDiv.style.display = '';
  } else {
    previewDiv.innerHTML = '';
    previewDiv.style.display = 'none';
  }
};

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

form.onsubmit = async function(e) {
  e.preventDefault();
  const formData = new FormData();
  const fileInput = document.getElementById('multiMemoImage');
  const file = fileInput.files[0];
  if (!file) return alert('이미지를 선택하세요.');
  formData.append('image', file);
  const memos = Array.from(memoList.querySelectorAll('input[name="memo"]')).map(i => i.value.trim()).filter(Boolean);
  if (memos.length === 0) return alert('메모를 1개 이상 입력하세요.');
  memos.forEach(m => formData.append('memo[]', m));
  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  resultDiv.innerHTML = data.urls.map((url, idx) =>
    `<div style='margin-bottom:12px;'>
      <div class='multi-memo-url'><a href='${url}' target='_blank'>${url}</a></div>
      <div style='color:#888;font-size:0.98em;'>메모: ${data.memos[idx]}</div>
      <button class='multi-memo-btn' type='button' data-url='${url}' style='padding:4px 12px;font-size:0.95em;margin-top:4px;'>복사</button>
    </div>`
  ).join('');
  // 복사 버튼 이벤트
  resultDiv.querySelectorAll('button[data-url]').forEach(btn => {
    btn.onclick = function() {
      const url = this.getAttribute('data-url');
      navigator.clipboard.writeText(url).then(() => {
        this.innerHTML = '✅';
        setTimeout(() => { this.innerHTML = '복사'; }, 1200);
      });
    };
  });
  // 입력란 초기화
  fileInput.value = '';
  while (memoList.children.length > 1) memoList.lastChild.remove();
  memoList.querySelector('input[name="memo"]').value = '';
}; 