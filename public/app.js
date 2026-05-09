const form = document.getElementById('generateForm');
const generateButton = document.getElementById('generateButton');
const configStatus = document.getElementById('configStatus');

const generationModeInput = document.getElementById('generationMode');
const apiKeyInput = document.getElementById('apiKey');
const imageOptions = document.getElementById('imageOptions');
const imageFileInput = document.getElementById('imageFile');
const resizeModeInput = document.getElementById('resizeMode');
const mimeTypeInput = document.getElementById('mimeType');

const modelInput = document.getElementById('model');
const durationInput = document.getElementById('durationSeconds');
const resolutionInput = document.getElementById('resolution');

const progress = document.getElementById('progress');
const progressTitle = document.getElementById('progressTitle');
const progressText = document.getElementById('progressText');

const errorBox = document.getElementById('errorBox');
const operationBox = document.getElementById('operationBox');
const operationNameEl = document.getElementById('operationName');
const videosEl = document.getElementById('videos');
const rawResponse = document.getElementById('rawResponse');

function setProgress(show, title = '', text = '') {
  progress.classList.toggle('hidden', !show);
  progressTitle.textContent = title;
  progressText.textContent = text;
}

function setError(message) {
  errorBox.classList.toggle('hidden', !message);
  errorBox.textContent = message || '';
}

function setRaw(data) {
  rawResponse.textContent = JSON.stringify(data || {}, null, 2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    const details = data.details ? `\n\n${JSON.stringify(data.details, null, 2)}` : '';
    throw new Error((data.error || `HTTP ${response.status}`) + details);
  }

  return data;
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });

  return parseResponse(response);
}

async function postFormData(url, formData, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  });

  return parseResponse(response);
}

function renderVideos(videos) {
  videosEl.innerHTML = '';

  for (const video of videos) {
    const wrapper = document.createElement('article');
    wrapper.className = 'video-item';

    const player = document.createElement('video');
    player.controls = true;
    player.loop = true;
    player.playsInline = true;
    player.src = video.url;

    const meta = document.createElement('div');
    meta.className = 'video-meta';
    meta.innerHTML = `
      <div>Video #${video.index + 1}</div>
      <code>${video.gcsUri || ''}</code>
      <a href="${video.url}" target="_blank" rel="noreferrer">Mở video trong tab mới</a>
    `;

    wrapper.append(player, meta);
    videosEl.append(wrapper);
  }
}

async function pollUntilDone(operationName, model, mode, apiKey) {
  let attempt = 0;
  const statusUrl = mode === 'image' ? '/api/public/video/status' : '/api/status';
  const statusHeaders = mode === 'image' ? { 'x-api-key': apiKey } : {};

  while (true) {
    attempt += 1;

    setProgress(
      true,
      'Đang render video...',
      `Đang kiểm tra trạng thái lần ${attempt}. Thường mất vài phút.`
    );

    const status = await postJson(
      statusUrl,
      {
        operationName,
        model
      },
      statusHeaders
    );

    setRaw(status.raw || status);

    if (status.done) {
      if (!status.videos || status.videos.length === 0) {
        throw new Error('Operation đã xong nhưng không có video trong response.');
      }

      renderVideos(status.videos);
      setProgress(false);
      return;
    }

    await sleep(15000);
  }
}

function updateDurationOptionsForModel() {
  const model = modelInput.value;
  const isVeo2 = model.startsWith('veo-2.');

  const options = isVeo2
    ? [
        ['5', '5 giây'],
        ['6', '6 giây'],
        ['7', '7 giây'],
        ['8', '8 giây']
      ]
    : [
        ['4', '4 giây'],
        ['6', '6 giây'],
        ['8', '8 giây']
      ];

  const current = durationInput.value;
  durationInput.innerHTML = '';

  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    durationInput.append(option);
  }

  const stillExists = options.some(([value]) => value === current);
  durationInput.value = stillExists ? current : options[0][0];

  resolutionInput.disabled = isVeo2;
  if (isVeo2) {
    resolutionInput.value = '720p';
  }
}

function updateModeUI() {
  const mode = generationModeInput.value;
  const imageMode = mode === 'image';

  imageOptions.classList.toggle('hidden', !imageMode);
  imageFileInput.required = imageMode;
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    const missing = [];
    if (!config.projectId) missing.push('project');
    if (!config.bucketName) missing.push('bucket');

    if (missing.length) {
      configStatus.className = 'status-pill bad';
      configStatus.textContent = `Thiếu cấu hình: ${missing.join(', ')}`;
    } else {
      configStatus.className = 'status-pill ok';
      configStatus.textContent = `${config.projectId} · ${config.region}`;
    }
  } catch (error) {
    configStatus.className = 'status-pill bad';
    configStatus.textContent = 'Không đọc được config';
  }
}

modelInput.addEventListener('change', updateDurationOptionsForModel);
generationModeInput.addEventListener('change', updateModeUI);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  generateButton.disabled = true;
  videosEl.innerHTML = '';
  setError('');
  setRaw({});
  operationBox.classList.add('hidden');

  const mode = generationModeInput.value;
  const apiKey = apiKeyInput.value.trim();

  const commonPayload = {
    prompt: document.getElementById('prompt').value,
    model: modelInput.value,
    aspectRatio: document.getElementById('aspectRatio').value,
    durationSeconds: Number(durationInput.value),
    sampleCount: Number(document.getElementById('sampleCount').value),
    resolution: resolutionInput.value,
    negativePrompt: document.getElementById('negativePrompt').value,
    personGeneration: document.getElementById('personGeneration').value,
    generateAudio: document.getElementById('generateAudio').checked
  };

  try {
    setProgress(true, 'Đang gửi request...', 'Đang gọi Vertex AI Veo predictLongRunning.');

    let result;

    if (mode === 'image') {
      if (!apiKey) {
        throw new Error('Vui lòng nhập PUBLIC_API_KEY để dùng Image to Video.');
      }

      const imageFile = imageFileInput.files?.[0];
      if (!imageFile) {
        throw new Error('Vui lòng chọn ảnh JPEG/PNG.');
      }

      const formData = new FormData();
      formData.append('imageFile', imageFile);
      formData.append('resizeMode', resizeModeInput.value);
      formData.append('mimeType', mimeTypeInput.value);

      for (const [key, value] of Object.entries(commonPayload)) {
        formData.append(key, String(value));
      }

      result = await postFormData('/api/public/video/create-from-image', formData, {
        'x-api-key': apiKey
      });
    } else {
      result = await postJson('/api/generate', commonPayload);
    }

    operationNameEl.textContent = result.operationName;
    operationBox.classList.remove('hidden');
    setRaw(result);

    await pollUntilDone(result.operationName, result.model, mode, apiKey);
  } catch (error) {
    setProgress(false);
    setError(error.message);
  } finally {
    generateButton.disabled = false;
  }
});

updateDurationOptionsForModel();
updateModeUI();
loadConfig();
