# 외부 소스 고지

## 함께 들어 있는 것
| 이름 | 쓰는 곳 | 라이선스 |
| --- | --- | --- |
| three.js r169 (three.module.min.js) | 모니터 3D 화면 | MIT — 원문 `hub/static/three.LICENSE.txt` |
| three.js GLTFLoader·BufferGeometryUtils (three-gltf.js, three-bgu.js) | 사무실 직원 모형 불러오기 | MIT(three.js 와 같은 원문) |

## 함께 들어 있는 자체 제작물
- 사무실 그림(office-room-v3.png, office-room-v3-fg.png): Adobe Firefly(Photoshop 「이미지 생성」)로 생성 — Adobe 생성형 AI 이용 조건을 따른다.
- 직원 모형·동작(office-worker.glb): Blender 로 자체 제작.

## 고객 PC에 따로 설치해서 쓰는 것(함께 배포하지 않음)
| 이름 | 라이선스 | 비고 |
| --- | --- | --- |
| Claude Agent SDK | Anthropic 이용 조건 | `pip install claude-agent-sdk` |
| Playwright MCP | Apache-2.0 | 크롬 조작 |
| Agent-Reach | MIT | 웹·유튜브 읽기 |
| HyperFrames | Apache-2.0 | 영상 렌더링 |
| Edge TTS(edge-tts) | MIT(서비스는 Microsoft 조건) | 음성 |
| instagram-agent-skill | MIT | 선택 |
| PhotoCraft·PdfCraft | Apache-2.0 / MIT | 선택. ArtCraft 상표 제외 |
| Open Generative AI(muapi) | MIT | 선택 |
| OpenMAIC / DeepTutor | MIT / Apache-2.0 | 선택 |
| Vibe-Trading | MIT | 선택, 백테스트만 |
| VoiceStudio | AGPL-3.0 | 선택. 별도 앱으로만 쓰고 Agent Hub 코드와 섞지 않음 |
| FinceptTerminal | AGPL-3.0 | 선택. 별도 앱으로만 쓰고 Agent Hub 코드와 섞지 않음 |
| Adobe Mixamo 애니메이션 | Adobe 이용약관(Mixamo: 상업용 프로젝트에 로열티 없이 사용 가능, 애니메이션 파일만 따로 재배포 금지) | 사무실 모니터 직원 동작. office-worker.glb 안에 모형 뼈대로 옮겨 넣은 형태로만 배포 |
