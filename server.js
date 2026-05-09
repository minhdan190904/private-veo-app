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
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

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

const TELEGRAM_DEFAULT_MODEL = MODELS[0];
const TELEGRAM_DEFAULT_DURATION = 4;
const TELEGRAM_POLL_INTERVAL_MS = 15000;
const TELEGRAM_MAX_POLLS = 40;
const TELEGRAM_REQUEST_TIMEOUT_SECONDS = 45;
const telegramSessions = new Map();
let telegramUpdateOffset = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTelegramDurationOptions(model) {
  if (String(model).startsWith('veo-2.')) {
    return [5, 6, 7, 8];
  }
  return [4, 6, 8];
}

function normalizeTelegramDuration(model, duration) {
  const options = getTelegramDurationOptions(model);
  return options.includes(duration) ? duration : options[0];
}

function createDefaultTelegramSession() {
  return {
    mode: 'prompt',
    model: TELEGRAM_DEFAULT_MODEL,
    durationSeconds: TELEGRAM_DEFAULT_DURATION,
    prompt: '',
    imageBase64: '',
    mimeType: 'image/jpeg',
    resizeMode: 'crop',
    running: false,
    lastUpdated: Date.now()
  };
}

function getTelegramSession(chatId) {
  const key = String(chatId);
  if (!telegramSessions.has(key)) {
    telegramSessions.set(key, createDefaultTelegramSession());
  }
  return telegramSessions.get(key);
}

function resetTelegramSession(chatId) {
  const nextSession = createDefaultTelegramSession();
  telegramSessions.set(String(chatId), nextSession);
  return nextSession;
}

function touchTelegramSession(session) {
  session.lastUpdated = Date.now();
}

function buildTelegramInlineKeyboard(session) {
  const keyboard = [
    [
      {
        text: session.mode === 'prompt' ? '✅ Prompt -> Video' : 'Prompt -> Video',
        callback_data: 'mode:prompt'
      },
      {
        text: session.mode === 'image' ? '✅ Anh + Prompt -> Video' : 'Anh + Prompt -> Video',
        callback_data: 'mode:image'
      }
    ]
  ];

  for (let i = 0; i < MODELS.length; i += 2) {
    const row = [];
    const leftModel = MODELS[i];
    row.push({
      text: session.model === leftModel ? `✅ ${leftModel}` : leftModel,
      callback_data: `model:${i}`
    });

    const rightIndex = i + 1;
    if (rightIndex < MODELS.length) {
      const rightModel = MODELS[rightIndex];
      row.push({
        text: session.model === rightModel ? `✅ ${rightModel}` : rightModel,
        callback_data: `model:${rightIndex}`
      });
    }

    keyboard.push(row);
  }

  const durationRow = getTelegramDurationOptions(session.model).map((seconds) => ({
    text: session.durationSeconds === seconds ? `✅ ${seconds}s` : `${seconds}s`,
    callback_data: `sec:${seconds}`
  }));
  keyboard.push(durationRow);

  keyboard.push([
    { text: '🚀 Tao video', callback_data: 'run' },
    { text: '♻️ Reset', callback_data: 'reset' }
  ]);

  return { inline_keyboard: keyboard };
}

function buildTelegramStatusText(session) {
  const modeLabel = session.mode === 'image' ? 'Anh + Prompt' : 'Prompt';
  const promptPreview = session.prompt ? escapeHtml(session.prompt.slice(0, 500)) : '<i>chua co</i>';
  const imageStatus =
    session.mode === 'image'
      ? session.imageBase64
        ? 'da co anh'
        : 'chua gui anh'
      : 'khong can';

  return [
    '<b>Veo Telegram Bot</b>',
    `Mode: <b>${modeLabel}</b>`,
    `Model: <code>${escapeHtml(session.model)}</code>`,
    `Seconds: <b>${session.durationSeconds}</b>`,
    `Prompt: ${promptPreview}`,
    `Image: <b>${imageStatus}</b>`,
    '',
    'Nhap prompt bang tin nhan text.',
    'Neu mode Anh + Prompt, gui them 1 anh (photo/document jpg/png).'
  ].join('\n');
}

async function telegramApiCall(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    const reason = data?.description || `Telegram API failed: ${method}`;
    throw new Error(reason);
  }

  return data.result;
}

async function telegramSendMessage(chatId, text, replyMarkup) {
  return telegramApiCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
}

async function telegramEditMessage(chatId, messageId, text, replyMarkup) {
  try {
    return await telegramApiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
  } catch (error) {
    if (String(error.message).toLowerCase().includes('message is not modified')) {
      return null;
    }
    throw error;
  }
}

async function telegramAnswerCallback(callbackQueryId, text = '') {
  try {
    await telegramApiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text
    });
  } catch (error) {
    console.error('answerCallbackQuery error:', error.message);
  }
}

async function fetchTelegramImageAsBase64(fileId) {
  const fileInfo = await telegramApiCall('getFile', { file_id: fileId });
  const filePath = fileInfo?.file_path;

  if (!filePath) {
    throw new Error('Khong lay duoc file_path tu Telegram.');
  }

  const response = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!response.ok) {
    throw new Error('Tai anh tu Telegram that bai.');
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function createVideoJobFromPrompt(input) {
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
      instances: [{ prompt: input.prompt }],
      parameters
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Vertex AI generate request failed.');
  }

  return {
    operationName: data.name,
    operationId: extractOperationId(data.name),
    model: input.model,
    storageUri
  };
}

async function createVideoJobFromImage(input) {
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
    throw new Error(data?.error?.message || 'Vertex AI image-to-video request failed.');
  }

  return {
    operationName: data.name,
    operationId: extractOperationId(data.name),
    model: input.model,
    storageUri
  };
}

async function fetchVideoStatusByOperation(model, operationName) {
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
    throw new Error(data?.error?.message || 'Vertex AI fetch operation failed.');
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

  return {
    ok: true,
    done: Boolean(data.done),
    videos: signedVideos,
    raw: data
  };
}

async function pollAndSendTelegramResult(chatId, model, operationName) {
  const session = getTelegramSession(chatId);

  for (let i = 1; i <= TELEGRAM_MAX_POLLS; i += 1) {
    await sleep(TELEGRAM_POLL_INTERVAL_MS);

    try {
      const status = await fetchVideoStatusByOperation(model, operationName);

      if (!status.done) {
        continue;
      }

      session.running = false;
      touchTelegramSession(session);

      if (!status.videos.length) {
        await telegramSendMessage(chatId, 'Job da xong nhung chua co video trong response.');
        return;
      }

      const lines = ['✅ Video da xong:'];
      for (const video of status.videos) {
        lines.push(`${video.index + 1}. ${video.url || video.gcsUri || '(khong co url)'}`);
      }
      await telegramSendMessage(chatId, lines.join('\n'));
      return;
    } catch (error) {
      if (i === TELEGRAM_MAX_POLLS) {
        session.running = false;
        touchTelegramSession(session);
        await telegramSendMessage(chatId, `Khong lay duoc trang thai video: ${escapeHtml(error.message)}`);
        return;
      }
    }
  }

  session.running = false;
  touchTelegramSession(session);
  await telegramSendMessage(chatId, 'Qua thoi gian cho. Ban hay tao lai job moi.');
}

async function runTelegramGeneration(chatId) {
  const session = getTelegramSession(chatId);

  if (session.running) {
    await telegramSendMessage(chatId, 'Dang co 1 job chay. Vui long doi job hien tai xong.');
    return;
  }

  if (!session.prompt.trim()) {
    await telegramSendMessage(chatId, 'Ban chua nhap prompt.');
    return;
  }

  if (session.mode === 'image' && !session.imageBase64) {
    await telegramSendMessage(chatId, 'Mode Anh + Prompt can gui anh truoc.');
    return;
  }

  try {
    requireConfig();

    const baseInput = {
      prompt: session.prompt,
      model: session.model,
      durationSeconds: session.durationSeconds,
      aspectRatio: '9:16',
      sampleCount: 1,
      resolution: '720p',
      generateAudio: false,
      negativePrompt: '',
      personGeneration: 'allow_adult'
    };

    let result;
    if (session.mode === 'image') {
      const imageInput = normalizeGenerateImageInput(
        {
          ...baseInput,
          imageBase64: session.imageBase64,
          mimeType: session.mimeType,
          resizeMode: session.resizeMode
        },
        null
      );
      result = await createVideoJobFromImage(imageInput);
    } else {
      const promptInput = normalizeGenerateInput(baseInput);
      result = await createVideoJobFromPrompt(promptInput);
    }

    session.running = true;
    touchTelegramSession(session);

    await telegramSendMessage(
      chatId,
      [
        '⏳ Da tao job thanh cong.',
        `Model: ${result.model}`,
        `Operation: ${result.operationName}`,
        'Bot se tu dong kiem tra den khi co video.'
      ].join('\n')
    );

    void pollAndSendTelegramResult(chatId, result.model, result.operationName);
  } catch (error) {
    await telegramSendMessage(chatId, `Khong tao duoc video: ${escapeHtml(error.message)}`);
  }
}

async function sendOrEditTelegramConfig(chatId, messageId = null) {
  const session = getTelegramSession(chatId);
  const text = buildTelegramStatusText(session);
  const keyboard = buildTelegramInlineKeyboard(session);

  if (messageId) {
    try {
      await telegramEditMessage(chatId, messageId, text, keyboard);
      return;
    } catch (error) {
      console.error('telegram editMessageText error:', error.message);
    }
  }

  await telegramSendMessage(chatId, text, keyboard);
}

async function handleTelegramMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const session = getTelegramSession(chatId);
  const text = String(message.text || '').trim();

  if (text === '/start' || text === '/menu') {
    resetTelegramSession(chatId);
    await sendOrEditTelegramConfig(chatId);
    return;
  }

  if (text === '/run') {
    await runTelegramGeneration(chatId);
    return;
  }

  if (message.photo?.length) {
    if (session.mode !== 'image') {
      await telegramSendMessage(chatId, 'Ban dang o mode Prompt. Chuyen sang mode Anh + Prompt de dung anh.');
      return;
    }

    const bestPhoto = message.photo[message.photo.length - 1];
    session.imageBase64 = await fetchTelegramImageAsBase64(bestPhoto.file_id);
    session.mimeType = 'image/jpeg';
    if (message.caption) {
      session.prompt = String(message.caption).trim();
    }
    touchTelegramSession(session);
    await sendOrEditTelegramConfig(chatId);
    return;
  }

  const document = message.document;
  const isImageDocument =
    document && ['image/jpeg', 'image/png'].includes(String(document.mime_type || '').toLowerCase());
  if (isImageDocument) {
    if (session.mode !== 'image') {
      await telegramSendMessage(chatId, 'Ban dang o mode Prompt. Chuyen sang mode Anh + Prompt de dung anh.');
      return;
    }

    session.imageBase64 = await fetchTelegramImageAsBase64(document.file_id);
    session.mimeType = String(document.mime_type).toLowerCase();
    if (message.caption) {
      session.prompt = String(message.caption).trim();
    }
    touchTelegramSession(session);
    await sendOrEditTelegramConfig(chatId);
    return;
  }

  if (text && !text.startsWith('/')) {
    session.prompt = text;
    touchTelegramSession(session);
    await sendOrEditTelegramConfig(chatId);
    return;
  }

  await telegramSendMessage(chatId, 'Dung /start de mo menu, gui prompt, hoac gui anh (mode Anh + Prompt).');
}

async function handleTelegramCallbackQuery(callbackQuery) {
  const data = String(callbackQuery.data || '');
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  if (!chatId || !messageId) {
    await telegramAnswerCallback(callbackQuery.id);
    return;
  }

  const session = getTelegramSession(chatId);

  if (data === 'run') {
    await telegramAnswerCallback(callbackQuery.id, 'Dang tao job...');
    await runTelegramGeneration(chatId);
    return;
  }

  if (data === 'reset') {
    resetTelegramSession(chatId);
    await telegramAnswerCallback(callbackQuery.id, 'Da reset.');
    await sendOrEditTelegramConfig(chatId, messageId);
    return;
  }

  if (data.startsWith('mode:')) {
    const mode = data.slice('mode:'.length);
    session.mode = mode === 'image' ? 'image' : 'prompt';
    if (session.mode === 'prompt') {
      session.imageBase64 = '';
      session.mimeType = 'image/jpeg';
    }
    touchTelegramSession(session);
    await telegramAnswerCallback(callbackQuery.id, 'Da doi mode.');
    await sendOrEditTelegramConfig(chatId, messageId);
    return;
  }

  if (data.startsWith('model:')) {
    const index = Number(data.slice('model:'.length));
    if (Number.isFinite(index) && index >= 0 && index < MODELS.length) {
      session.model = MODELS[index];
      session.durationSeconds = normalizeTelegramDuration(session.model, session.durationSeconds);
      touchTelegramSession(session);
      await telegramAnswerCallback(callbackQuery.id, 'Da doi model.');
      await sendOrEditTelegramConfig(chatId, messageId);
      return;
    }
  }

  if (data.startsWith('sec:')) {
    const seconds = Number(data.slice('sec:'.length));
    session.durationSeconds = normalizeTelegramDuration(session.model, seconds);
    touchTelegramSession(session);
    await telegramAnswerCallback(callbackQuery.id, 'Da doi so giay.');
    await sendOrEditTelegramConfig(chatId, messageId);
    return;
  }

  await telegramAnswerCallback(callbackQuery.id);
}

async function handleTelegramUpdate(update) {
  if (update.message) {
    await handleTelegramMessage(update.message);
    return;
  }
  if (update.callback_query) {
    await handleTelegramCallbackQuery(update.callback_query);
  }
}

async function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Missing TELEGRAM_BOT_TOKEN in .env. Telegram bot is disabled.');
    return;
  }

  console.log('Telegram bot polling started.');

  while (true) {
    try {
      const updates = await telegramApiCall('getUpdates', {
        timeout: TELEGRAM_REQUEST_TIMEOUT_SECONDS,
        offset: telegramUpdateOffset,
        allowed_updates: ['message', 'callback_query']
      });

      for (const update of updates) {
        telegramUpdateOffset = update.update_id + 1;
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          console.error('Telegram update handler error:', error.message);
        }
      }
    } catch (error) {
      console.error('Telegram polling error:', error.message);
      await sleep(3000);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Veo web UI running at http://localhost:${PORT}`);
  void startTelegramBot();
});
