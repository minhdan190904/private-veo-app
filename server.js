import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';
import { Storage } from '@google-cloud/storage';
import swaggerUi from 'swagger-ui-express';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
const REGION = process.env.GOOGLE_CLOUD_LOCATION || process.env.REGION || 'us-central1';
const BUCKET_NAME = process.env.BUCKET_NAME;
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';
const PUBLIC_API_KEY = String(process.env.PUBLIC_API_KEY || '');

const MODELS = [
  'veo-3.1-fast-generate-001',
  'veo-3.1-generate-001',
  'veo-3.0-fast-generate-001',
  'veo-3.0-generate-001',
  'veo-2.0-generate-001'
];

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Veo Public API',
    version: '1.0.0',
    description: 'Public API for creating and checking Veo video generation jobs'
  },
  servers: [
    {
      url: 'http://localhost:3000'
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key'
      }
    },
    schemas: {
      CreateVideoRequest: {
        type: 'object',
        required: ['prompt'],
        additionalProperties: false,
        properties: {
          prompt: {
            type: 'string',
            description: 'Video prompt',
            example: 'A cinematic drone shot of Da Nang beach at sunrise'
          },
          model: {
            type: 'string',
            description: 'Veo model',
            enum: MODELS,
            default: 'veo-3.1-fast-generate-001'
          },
          aspectRatio: {
            type: 'string',
            description: 'Output ratio',
            enum: ['16:9', '9:16'],
            default: '9:16'
          },
          durationSeconds: {
            type: 'integer',
            description: 'Veo 3: 4/6/8. Veo 2: 5-8',
            default: 4,
            minimum: 1
          },
          sampleCount: {
            type: 'integer',
            description: 'Number of samples',
            default: 1,
            minimum: 1,
            maximum: 4
          },
          resolution: {
            type: 'string',
            description: 'Output resolution',
            enum: ['720p', '1080p', '4k'],
            default: '720p'
          },
          generateAudio: {
            type: 'boolean',
            description: 'Generate audio track',
            default: false
          },
          negativePrompt: {
            type: 'string',
            description: 'Negative prompt (optional)',
            default: ''
          },
          personGeneration: {
            type: 'string',
            description: 'Person generation policy',
            enum: ['allow_adult', 'disallow'],
            default: 'allow_adult'
          }
        }
      },
      CreateVideoResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          operationName: { type: 'string' },
          operationId: { type: 'string' },
          model: { type: 'string' },
          storageUri: { type: 'string' }
        }
      },
      StatusRequest: {
        type: 'object',
        required: ['operationName'],
        additionalProperties: false,
        properties: {
          model: {
            type: 'string',
            enum: MODELS,
            default: 'veo-3.1-fast-generate-001'
          },
          operationName: {
            type: 'string',
            description: 'Operation name returned by create endpoint'
          }
        }
      },
      CreateVideoFromImageRequest: {
        type: 'object',
        required: ['prompt'],
        additionalProperties: false,
        properties: {
          prompt: {
            type: 'string',
            description: 'Video prompt',
            example: 'A gentle camera move as the person smiles and wind moves hair'
          },
          imageFile: {
            type: 'string',
            format: 'binary',
            description: 'Upload image file (jpeg/png). Preferred for multipart/form-data.'
          },
          imageBase64: {
            type: 'string',
            description: 'Input image bytes as Base64 (optional fallback, no data:image/... prefix)'
          },
          mimeType: {
            type: 'string',
            description: 'Input image MIME type (optional if uploading imageFile)',
            enum: ['image/jpeg', 'image/png'],
            default: 'image/jpeg'
          },
          resizeMode: {
            type: 'string',
            description: 'How to fit source image to video frame',
            enum: ['crop', 'pad'],
            default: 'crop'
          },
          model: {
            type: 'string',
            description: 'Veo model',
            enum: MODELS,
            default: 'veo-3.1-fast-generate-001'
          },
          aspectRatio: {
            type: 'string',
            description: 'Output ratio',
            enum: ['16:9', '9:16'],
            default: '9:16'
          },
          durationSeconds: {
            type: 'integer',
            description: 'Veo 3: 4/6/8. Veo 2: 5-8',
            default: 4,
            minimum: 1
          },
          sampleCount: {
            type: 'integer',
            description: 'Number of samples',
            default: 1,
            minimum: 1,
            maximum: 4
          },
          resolution: {
            type: 'string',
            description: 'Output resolution',
            enum: ['720p', '1080p', '4k'],
            default: '720p'
          },
          generateAudio: {
            type: 'boolean',
            description: 'Generate audio track',
            default: false
          },
          negativePrompt: {
            type: 'string',
            description: 'Negative prompt (optional)',
            default: ''
          },
          personGeneration: {
            type: 'string',
            description: 'Person generation policy',
            enum: ['allow_adult', 'disallow'],
            default: 'allow_adult'
          }
        }
      },
      StatusResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          done: { type: 'boolean', example: false },
          videos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer', example: 0 },
                gcsUri: { type: 'string' },
                url: { type: 'string' },
                mimeType: { type: 'string', example: 'video/mp4' }
              }
            }
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Invalid apiKey.' }
        }
      }
    }
  },
  paths: {
    '/api/public/video/create': {
      post: {
        summary: 'Create a video generation job',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateVideoRequest' }
            },
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/CreateVideoRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Job created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateVideoResponse' }
              }
            }
          },
          400: {
            description: 'Validation or request error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          401: {
            description: 'Invalid apiKey',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/public/video/create-from-image': {
      post: {
        summary: 'Create a video generation job from image + prompt',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/CreateVideoFromImageRequest' }
            },
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateVideoFromImageRequest' }
            },
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/CreateVideoFromImageRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Job created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateVideoResponse' }
              }
            }
          },
          400: {
            description: 'Validation or request error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          401: {
            description: 'Invalid apiKey',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/public/video/status': {
      post: {
        summary: 'Check video generation status',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StatusRequest' }
            },
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/StatusRequest' }
            }
          }
        },
        responses: {
          200: {
            description: 'Status fetched',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StatusResponse' }
              }
            }
          },
          400: {
            description: 'Validation or request error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          401: {
            description: 'Invalid apiKey',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    }
  }
};

if (!PROJECT_ID) {
  console.warn('Missing GOOGLE_CLOUD_PROJECT or PROJECT_ID in .env');
}

if (!BUCKET_NAME) {
  console.warn('Missing BUCKET_NAME in .env. Video output needs a Cloud Storage bucket.');
}

if (!PUBLIC_API_KEY) {
  console.warn('Missing PUBLIC_API_KEY in .env. Public API endpoints will be disabled.');
}

const auth = new GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

const storage = new Storage({
  keyFilename: KEY_FILE,
  projectId: PROJECT_ID
});

function requireConfig() {
  const missing = [];
  if (!PROJECT_ID) missing.push('GOOGLE_CLOUD_PROJECT');
  if (!REGION) missing.push('GOOGLE_CLOUD_LOCATION');
  if (!BUCKET_NAME) missing.push('BUCKET_NAME');
  if (missing.length > 0) {
    throw new Error(`Missing config: ${missing.join(', ')}`);
  }
}

async function getAccessToken() {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;

  if (!token) {
    throw new Error('Could not obtain Google access token');
  }

  return token;
}

function parseGsUri(gsUri) {
  if (!gsUri || !gsUri.startsWith('gs://')) {
    throw new Error(`Invalid GCS URI: ${gsUri}`);
  }

  const withoutPrefix = gsUri.slice('gs://'.length);
  const slashIndex = withoutPrefix.indexOf('/');

  if (slashIndex === -1) {
    return {
      bucket: withoutPrefix,
      object: ''
    };
  }

  return {
    bucket: withoutPrefix.slice(0, slashIndex),
    object: withoutPrefix.slice(slashIndex + 1)
  };
}

async function createSignedUrl(gsUri) {
  const { bucket, object } = parseGsUri(gsUri);

  if (!object) {
    throw new Error(`GCS URI has no object path: ${gsUri}`);
  }

  const [url] = await storage
    .bucket(bucket)
    .file(object)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 1000 * 60 * 60
    });

  return url;
}

function buildGenerateUrl(model) {
  return (
    `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${REGION}/publishers/google/models/${model}:predictLongRunning`
  );
}

function buildFetchUrl(model) {
  return (
    `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${REGION}/publishers/google/models/${model}:fetchPredictOperation`
  );
}

function cleanNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function normalizeGenerateInput(body) {
  const prompt = String(body.prompt || '').trim();

  if (!prompt) {
    throw new Error('Bạn chưa nhập prompt.');
  }

  const model = String(body.model || 'veo-3.1-fast-generate-001');

  if (!MODELS.includes(model)) {
    throw new Error('Model không hợp lệ.');
  }

  const aspectRatio = String(body.aspectRatio || '9:16');

  if (!['16:9', '9:16'].includes(aspectRatio)) {
    throw new Error('Aspect ratio phải là 16:9 hoặc 9:16.');
  }

  const isVeo2 = model.startsWith('veo-2.');
  let durationSeconds = cleanNumber(body.durationSeconds, isVeo2 ? 8 : 4);

  if (isVeo2) {
    durationSeconds = Math.max(5, Math.min(8, Math.round(durationSeconds)));
  } else if (![4, 6, 8].includes(durationSeconds)) {
    throw new Error('Veo 3/Veo 3.1 chỉ nhận số giây: 4, 6 hoặc 8.');
  }

  let sampleCount = cleanNumber(body.sampleCount, 1);
  sampleCount = Math.max(1, Math.min(4, Math.round(sampleCount)));

  const resolution = String(body.resolution || '720p');
  const allowedResolutions = model.includes('preview')
    ? ['720p', '1080p', '4k']
    : ['720p', '1080p'];

  if (!allowedResolutions.includes(resolution)) {
    throw new Error(`Resolution không hợp lệ cho model này. Hỗ trợ: ${allowedResolutions.join(', ')}`);
  }

  const generateAudio = cleanBoolean(body.generateAudio, false);
  const negativePrompt = String(body.negativePrompt || '').trim();
  const personGeneration = String(body.personGeneration || 'allow_adult');

  if (!['allow_adult', 'disallow'].includes(personGeneration)) {
    throw new Error('personGeneration không hợp lệ.');
  }

  return {
    prompt,
    model,
    aspectRatio,
    durationSeconds,
    sampleCount,
    resolution,
    generateAudio,
    negativePrompt,
    personGeneration
  };
}

function normalizeGenerateImageInput(body, file) {
  const input = normalizeGenerateInput(body);
  const imageBase64FromBody = String(body.imageBase64 || '').trim();
  const imageBase64FromFile = file?.buffer ? file.buffer.toString('base64') : '';
  const imageBase64 = imageBase64FromFile || imageBase64FromBody;
  const mimeType = String(body.mimeType || file?.mimetype || '').trim().toLowerCase();
  const resizeMode = String(body.resizeMode || 'crop').trim().toLowerCase();

  if (!imageBase64) {
    throw new Error('Thieu imageBase64.');
  }

  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    throw new Error('mimeType phai la image/jpeg hoac image/png.');
  }

  if (!['crop', 'pad'].includes(resizeMode)) {
    throw new Error('resizeMode phai la crop hoac pad.');
  }

  return {
    ...input,
    imageBase64,
    mimeType,
    resizeMode
  };
}

function extractOperationId(operationName) {
  const parts = String(operationName || '').split('/');
  return parts[parts.length - 1] || '';
}

function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function hasValidApiKey(req) {
  if (!PUBLIC_API_KEY) return false;

  const providedApiKey =
    String(req.body?.apiKey || req.headers['x-api-key'] || req.query.apiKey || '').trim();

  if (!providedApiKey) return false;

  const expectedHash = hashApiKey(PUBLIC_API_KEY);
  const providedHash = hashApiKey(providedApiKey);

  if (expectedHash.length !== providedHash.length) return false;
  return crypto.timingSafeEqual(expectedHash, providedHash);
}

function requirePublicApiKey(req, res, next) {
  if (!PUBLIC_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'Public API is disabled. Missing PUBLIC_API_KEY on server.'
    });
  }

  if (!hasValidApiKey(req)) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid apiKey.'
    });
  }

  next();
}

app.get('/api/config', (req, res) => {
  res.json({
    projectId: PROJECT_ID || null,
    region: REGION,
    bucketName: BUCKET_NAME || null,
    models: MODELS
  });
});

app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.post('/api/generate', async (req, res) => {
  try {
    requireConfig();

    const input = normalizeGenerateInput(req.body);
    const accessToken = await getAccessToken();

    const jobId = crypto.randomUUID();
    const storageUri = `gs://${BUCKET_NAME}/veo-output/${jobId}/`;

    const parameters = {
      storageUri,
      sampleCount: input.sampleCount,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      personGeneration: input.personGeneration,
      generateAudio: input.generateAudio
    };

    if (input.negativePrompt) {
      parameters.negativePrompt = input.negativePrompt;
    }

    if (!input.model.startsWith('veo-2.')) {
      parameters.resolution = input.resolution;
    }

    const response = await fetch(buildGenerateUrl(input.model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: input.prompt
          }
        ],
        parameters
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Vertex AI generate request failed',
        details: data
      });
    }

    res.json({
      ok: true,
      operationName: data.name,
      operationId: extractOperationId(data.name),
      model: input.model,
      storageUri,
      request: {
        ...input,
        prompt: input.prompt
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/status', async (req, res) => {
  try {
    requireConfig();

    const model = String(req.body.model || 'veo-3.1-fast-generate-001');
    const operationName = String(req.body.operationName || '').trim();

    if (!MODELS.includes(model)) {
      throw new Error('Model không hợp lệ.');
    }

    if (!operationName) {
      throw new Error('Thiếu operationName.');
    }

    const accessToken = await getAccessToken();

    const response = await fetch(buildFetchUrl(model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        operationName
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Vertex AI fetch operation failed',
        details: data
      });
    }

    const videos = data.response?.videos || [];

    const signedVideos = await Promise.all(
      videos.map(async (video, index) => {
        const gcsUri = video.gcsUri;
        const url = gcsUri ? await createSignedUrl(gcsUri) : null;

        return {
          index,
          gcsUri,
          url,
          mimeType: video.mimeType || 'video/mp4'
        };
      })
    );

    res.json({
      ok: true,
      done: Boolean(data.done),
      videos: signedVideos,
      raw: data
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/public/video/create', requirePublicApiKey, async (req, res) => {
  try {
    requireConfig();

    const input = normalizeGenerateInput(req.body);
    const accessToken = await getAccessToken();

    const jobId = crypto.randomUUID();
    const storageUri = `gs://${BUCKET_NAME}/veo-output/${jobId}/`;

    const parameters = {
      storageUri,
      sampleCount: input.sampleCount,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      personGeneration: input.personGeneration,
      generateAudio: input.generateAudio
    };

    if (input.negativePrompt) {
      parameters.negativePrompt = input.negativePrompt;
    }

    if (!input.model.startsWith('veo-2.')) {
      parameters.resolution = input.resolution;
    }

    const response = await fetch(buildGenerateUrl(input.model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: input.prompt
          }
        ],
        parameters
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Vertex AI generate request failed',
        details: data
      });
    }

    res.json({
      ok: true,
      operationName: data.name,
      operationId: extractOperationId(data.name),
      model: input.model,
      storageUri,
      request: {
        ...input,
        prompt: input.prompt
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/public/video/status', requirePublicApiKey, async (req, res) => {
  try {
    requireConfig();

    const model = String(req.body.model || 'veo-3.1-fast-generate-001');
    const operationName = String(req.body.operationName || '').trim();

    if (!MODELS.includes(model)) {
      throw new Error('Model khong hop le.');
    }

    if (!operationName) {
      throw new Error('Thieu operationName.');
    }

    const accessToken = await getAccessToken();

    const response = await fetch(buildFetchUrl(model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        operationName
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Vertex AI fetch operation failed',
        details: data
      });
    }

    const videos = data.response?.videos || [];

    const signedVideos = await Promise.all(
      videos.map(async (video, index) => {
        const gcsUri = video.gcsUri;
        const url = gcsUri ? await createSignedUrl(gcsUri) : null;

        return {
          index,
          gcsUri,
          url,
          mimeType: video.mimeType || 'video/mp4'
        };
      })
    );

    res.json({
      ok: true,
      done: Boolean(data.done),
      videos: signedVideos,
      raw: data
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/public/video/create-from-image', upload.single('imageFile'), requirePublicApiKey, async (req, res) => {
  try {
    requireConfig();

    const input = normalizeGenerateImageInput(req.body, req.file);
    const accessToken = await getAccessToken();

    const jobId = crypto.randomUUID();
    const storageUri = `gs://${BUCKET_NAME}/veo-output/${jobId}/`;

    const parameters = {
      storageUri,
      sampleCount: input.sampleCount,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      personGeneration: input.personGeneration,
      generateAudio: input.generateAudio,
      resizeMode: input.resizeMode
    };

    if (input.negativePrompt) {
      parameters.negativePrompt = input.negativePrompt;
    }

    if (!input.model.startsWith('veo-2.')) {
      parameters.resolution = input.resolution;
    }

    const response = await fetch(buildGenerateUrl(input.model), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: input.prompt,
            image: {
              bytesBase64Encoded: input.imageBase64,
              mimeType: input.mimeType
            }
          }
        ],
        parameters
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Vertex AI image-to-video request failed',
        details: data
      });
    }

    res.json({
      ok: true,
      operationName: data.name,
      operationId: extractOperationId(data.name),
      model: input.model,
      storageUri,
      request: {
        prompt: input.prompt,
        model: input.model,
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        sampleCount: input.sampleCount,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
        negativePrompt: input.negativePrompt,
        personGeneration: input.personGeneration,
        resizeMode: input.resizeMode,
        mimeType: input.mimeType
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Veo web UI running at http://localhost:${PORT}`);
});
