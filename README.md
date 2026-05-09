# Veo Backend (Node.js + Web UI)

Backend Node.js để tạo video bằng Vertex AI Veo, có sẵn UI web và public API cho mobile.

## 1. Yêu cầu

- Node.js >= 18
- npm >= 9
- Google Cloud project đã bật billing
- Đã bật API:
  - Vertex AI API
  - Cloud Storage API

## 2. Biến môi trường (`.env`)

Dự án hiện tại đọc các biến sau từ `server.js`:

```env
# Bắt buộc
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
BUCKET_NAME=your-output-bucket-name
PUBLIC_API_KEY=your-very-strong-api-key

# Tuỳ chọn
PORT=3000
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Alias tương thích cũ (không bắt buộc nếu đã có GOOGLE_CLOUD_*):
# PROJECT_ID=your-gcp-project-id
# REGION=us-central1
```

Lưu ý:
- `BUCKET_NAME` chỉ là tên bucket, không có `gs://`.
- Nếu không set `GOOGLE_APPLICATION_CREDENTIALS`, app mặc định dùng `./service-account.json`.
- Nếu thiếu `PUBLIC_API_KEY`, các endpoint public sẽ trả `503`.

## 3. Chạy local

1. Cài dependency:

```bash
npm install
```

2. Tạo file `.env` theo mẫu ở trên.

3. Đặt file key vào root dự án:

```txt
service-account.json
```

4. Chạy app:

```bash
npm start
```

5. Mở:
- UI: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## 4. IAM tối thiểu cho service account

Service account dùng để gọi Vertex và ký signed URL từ GCS nên cần tối thiểu:

- `roles/aiplatform.user` (Vertex AI User)
- `roles/storage.objectAdmin` (Storage Object Admin)
- `roles/iam.serviceAccountTokenCreator` (để ký URL nếu cần)

## 5. Endpoint chính

- Private (UI/backend nội bộ):
  - `POST /api/generate`
  - `POST /api/status`
- Public (bảo vệ bằng `x-api-key`):
  - `POST /api/public/video/create`
  - `POST /api/public/video/status`
  - `POST /api/public/video/create-from-image` (hỗ trợ JSON + multipart)

## 6. Deploy lên Google Cloud (khuyên dùng Cloud Run)

### 6.1. Chuẩn bị

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

Tạo secret cho key JSON (an toàn hơn commit file):

```bash
gcloud secrets create veo-sa-key --replication-policy=automatic
cat service-account.json | gcloud secrets versions add veo-sa-key --data-file=-
```

### 6.2. Deploy Cloud Run từ source

```bash
gcloud run deploy veo-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GOOGLE_CLOUD_LOCATION=us-central1,BUCKET_NAME=YOUR_BUCKET,PUBLIC_API_KEY=YOUR_API_KEY,GOOGLE_APPLICATION_CREDENTIALS=/secrets/veo/service-account.json \
  --update-secrets /secrets/veo/service-account.json=veo-sa-key:latest
```

Sau deploy, Cloud Run sẽ trả URL service. Kiểm tra nhanh:

```bash
curl https://YOUR_CLOUD_RUN_URL/api/config
```

Gợi ý production:
- Đổi `--allow-unauthenticated` sang private nếu chỉ gọi nội bộ.
- Không để `PUBLIC_API_KEY` yếu; nên xoay vòng key định kỳ.

## 7. Deploy Google Cloud bằng Compute Engine VM (nếu cần VPS trong GCP)

1. Tạo VM Ubuntu.
2. SSH vào VM và cài Node + Nginx + PM2.
3. Clone repo, tạo `.env`, copy `service-account.json`.
4. Chạy app bằng PM2:

```bash
npm install
pm2 start server.js --name veo-backend
pm2 save
pm2 startup
```

5. Cấu hình Nginx reverse proxy `:80 -> :3000`.
6. Mở firewall cho `80/443`.
7. Cài SSL bằng Certbot.

## 8. Deploy lên VPS (Ubuntu, ngoài GCP)

### 8.1. Cài runtime

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

### 8.2. Chạy app

```bash
git clone <repo-url> veo-backend
cd veo-backend
npm install
```

Tạo `.env` và `service-account.json` trong root, rồi:

```bash
pm2 start server.js --name veo-backend
pm2 save
pm2 startup
```

### 8.3. Nginx reverse proxy

Tạo file `/etc/nginx/sites-available/veo-backend`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Bật site:

```bash
sudo ln -s /etc/nginx/sites-available/veo-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8.4. SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 9. Kiểm tra sau deploy

- Health/config:

```bash
curl https://your-domain-or-url/api/config
```

- Test public API:

```bash
curl -X POST https://your-domain-or-url/api/public/video/create \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "prompt": "A cinematic drone shot of Da Nang beach at sunrise",
    "model": "veo-3.1-fast-generate-001",
    "aspectRatio": "9:16",
    "durationSeconds": 4,
    "sampleCount": 1,
    "resolution": "720p",
    "generateAudio": false
  }'
```

## 10. Bảo mật

- Không commit `.env` và `service-account.json`.
- Không đặt key JSON trong `public/` hoặc frontend/mobile app.
- Dùng Secret Manager (Cloud Run) hoặc secret manager của VPS/platform.
- Giới hạn CORS theo domain thật nếu đưa vào production.
