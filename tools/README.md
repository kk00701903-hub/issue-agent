# 도구(Tool) 만들기

도구 = 판매 단위. 한 가지 일(예: 인스타그램 릴스)의 팀·규칙·검수기·스킬·문서를 한 폴더에 묶는다.
고객은 요금제에 든 도구만 켜고, 에이전트를 도구에 연결해서 쓴다.

```
tools/<id>/
  tool.json          매니페스트(아래)
  rules.json         (선택) 검수 규칙 기본값. 고객이 관리 화면에서 덮어씀(data/tools/<id>.json)
  validator.py       (선택) validate(결과) → {"passed", "errors", "warnings", "stats"}
  samples.py         (선택) 드라이런용 가짜 결과
  agents/*.md        판매본 .claude/agents 로 들어가는 에이전트 정의
  skills/<이름>/SKILL.md   판매본 .claude/skills 로 들어가는 스킬
  docs/*.md          에이전트가 읽는 문서
```

## tool.json
| 키 | 뜻 |
| --- | --- |
| `id`, `name`, `icon`, `category`, `version`, `order` | 이름·순서 |
| `summary`, `highlights` | 관리 화면·판매 페이지 소개 |
| `team` | 팀(관리 화면·사무실의 방): `id`, `title`, `lead`, `purpose`, `flow`(단계), `agents`(이름·제목·역할·쓰는 도구·금지) |
| `default_agents` | 처음 켰을 때 연결되는 에이전트(팀 + 쓰는 공용 에이전트) |
| `run` | 「만들기」: `agent`(기본 실행 에이전트), `output`(package.json·result.md), `form`(입력칸), `prompt`(에이전트에 줄 지시, `{topic}` 같은 입력칸 이름과 `{out}` `{agent}` `{tool_name}` `{details_line}` 를 씀) |
| `validator` | true 면 validator.py 사용. 없으면 문서 기본 검수(비어 있음·짧음·「확인 필요」 목록) |
| `settings` | 고객 설정 기본값(인스타그램은 계정 목록) |
| `external` | 고객 PC에 따로 설치하는 외부 도구와 라이선스 |
| `safety` | 안전 장치 설명 |
| `beta`, `default_enabled`, `core` | 베타 표시, 처음 켜짐 여부, 공용(요금제와 무관) |

## 새 도구를 팔 때
1. 위 구조로 폴더를 만든다(개인 정보 글자 금지 — 묶음 만들 때 검사함).
2. `cloud/plans.json` 의 `tools` 에 같은 `id` 를 넣는다(시험 `test_cloud_tool_ids_match_catalog` 가 확인).
3. `python -m unittest discover -s tests` → `python scripts/build_release.py`.
