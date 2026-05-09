# Veo Node Web UI

Web Node.js + UI để tạo video bằng Vertex AI Veo.

## 1. Cài đặt

```bash
npm install
cp .env.example .env
```

Đặt file service account JSON vào folder này và đổi tên thành:

```txt
service-account.json
```

Hoặc sửa biến này trong `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=./duong-dan-file-json-cua-ban.json
```

## 2. Sửa `.env`

```env
GOOGLE_CLOUD_PROJECT=foranhdan
GOOGLE_CLOUD_LOCATION=us-central1
BUCKET_NAME=your-veo-output-bucket
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
PORT=3000
```

`BUCKET_NAME` chỉ ghi tên bucket, ví dụ:

```env
BUCKET_NAME=foranhdan-veo-output
```

Không ghi `gs://`.

## 3. Quyền service account cần có

Trong Google Cloud Console, service account cần tối thiểu:

- Vertex AI User
- Storage Object Admin

Nếu signed URL bị lỗi quyền ký, thêm:

- Service Account Token Creator

## 4. API cần bật

- Vertex AI API
- Cloud Storage API

## 5. Chạy

```bash
npm start
```

Mở:

```txt
http://localhost:3000
```

## 6. Lưu ý bảo mật

Không đưa `service-account.json` vào Flutter, frontend, GitHub hoặc thư mục `public`.
File JSON chỉ nằm ở backend Node.js.
## 7. Public API cho Android

Them key trong `.env`:

```env
PUBLIC_API_KEY=your-secret-key
```

Tao video:

```http
POST /api/public/video/create
Content-Type: application/json
x-api-key: your-secret-key
```

Body mau:

```json
{
  "prompt": "A cinematic drone shot of Da Nang beach at sunrise",
  "model": "veo-3.1-fast-generate-001",
  "aspectRatio": "9:16",
  "durationSeconds": 4,
  "sampleCount": 1,
  "resolution": "720p",
  "generateAudio": false
}
```

Kiem tra trang thai:

```http
POST /api/public/video/status
Content-Type: application/json
x-api-key: your-secret-key
```

```json
{
  "model": "veo-3.1-fast-generate-001",
  "operationName": "projects/.../locations/.../publishers/google/models/.../operations/..."
}
```

## 8. Swagger

Sau khi chay server, mo:

```txt
http://localhost:3000/docs
```

File OpenAPI JSON:

```txt
http://localhost:3000/openapi.json
```

Trong Swagger UI, bam `Authorize` va nhap gia tri `x-api-key` = `PUBLIC_API_KEY`.

## 9. Image to Video API

Endpoint:

```http
POST /api/public/video/create-from-image
```

Headers:

```http
x-api-key: <PUBLIC_API_KEY>
Content-Type: application/json
```

Body example:

```json
{
  "prompt": "A gentle camera move as the person smiles and wind moves hair",
  "imageBase64": "<base64-image-no-data-uri>",
  "mimeType": "image/jpeg",
  "resizeMode": "crop",
  "model": "veo-3.1-fast-generate-001",
  "aspectRatio": "9:16",
  "durationSeconds": 4,
  "sampleCount": 1,
  "resolution": "720p",
  "generateAudio": false
}
```

Luu y:
- `imageBase64` chi gui bytes base64, khong gui prefix `data:image/...;base64,`.
- `mimeType` ho tro: `image/jpeg`, `image/png`.
- `resizeMode`: `crop` hoac `pad`.

## 10. Multipart Image Upload (Android)

`/api/public/video/create-from-image` da ho tro `multipart/form-data`.

Field file:
- `imageFile`: file anh jpeg/png

Field text:
- `prompt` (bat buoc)
- `model`, `aspectRatio`, `durationSeconds`, `sampleCount`, `resolution`
- `generateAudio`, `negativePrompt`, `personGeneration`, `resizeMode`
- `mimeType` (co the bo qua neu gui `imageFile`)

Server se tu dong doi `imageFile` sang base64 roi gui len Vertex AI.
