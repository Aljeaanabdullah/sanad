# Face model (web panel)

**Model:** dlib ResNet face recognition (Davis King), as ported to TensorFlow.js by face-api.js
(`@vladmandic/face-api`, MIT). The author released the weights into the public domain
(<https://github.com/davisking/dlib-models>). It was trained on ~3M faces including the VGG Face
dataset, so the legal review in Phase 12 should confirm its use.

The web panel uses it for face enrollment (`apps/admin/src/lib/face/`):

| Step | Where |
|---|---|
| Face detection + landmarks | face-api TinyFaceDetector + 68 landmarks |
| Alignment to a 150×150 chip ("align-v1") | `apps/admin/src/lib/face/align.ts` |
| Descriptor (128 numbers) | face-api `FaceRecognitionNet` |

The mobile app (Expo) no longer matches faces itself: it punches with the phone's Face ID /
fingerprint plus a review photo (PRD 4.6). The server still accepts the face-descriptor path.

## Alignment fixtures

`make_align_fixtures.py` computes the alignment independently in Python and writes
`align-fixtures.json`, which `apps/admin/src/lib/face/align.test.ts` checks:

```bash
python tools/face-model/make_align_fixtures.py
```
