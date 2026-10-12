# 손금AI — 사진 한 장으로 보는 손금 운세

손바닥 사진을 보며 손금 특징 13가지를 고르면 성격·연애·재물·커리어·활력 다섯 가지 풀이, 성향 지표, 공유용 결과 카드를 만들어 줍니다. 해석 규칙은 국내외 손금 자료 21건을 정리해 만들었습니다.

**웹에서 바로 쓰기:** GitHub Pages 주소 (저장소 About 참고)

> 손금 풀이는 과학적 근거가 없는 재미용 콘텐츠입니다. 사진은 기기 밖으로 보내지 않습니다(AI 분석 모드 제외, 이때도 저장하지 않음).

## 구조

| 경로 | 역할 |
| --- | --- |
| `site/rules.json` | 질문 13개, 손 유형 4가지, 특징별 해석 문장, 성향 지표 가중치 |
| `site/engine.js` | 답을 검증하고 풀이를 만드는 규칙 엔진 (브라우저에서 실행) |
| `site/app.js`, `index.html`, `app.css` | 화면: 시작 → 촬영·품질 체크 → 손금 확인 → 결과·공유 카드 |
| `server.py` | 로컬 실행용 서버. API 키가 있으면 AI 사진 분석을 켬 |
| `vision.py` | Claude로 사진에서 손금 특징을 읽는 모듈 |
| `test_rules.py` | 해석 데이터 검사 (금지어 포함) |
| `.github/workflows/pages.yml` | `main`에 푸시하면 검사 후 `site/`를 Pages로 배포 |

해석 문구를 바꾸려면 `site/rules.json`만 고치면 됩니다. 수명·질병·이혼 같은 표현은 `test_rules.py`가 막습니다.

## 로컬 실행

```
python server.py
```

http://localhost:8000 을 엽니다. Python 3.10 이상, 추가 설치 없음.

### AI 자동 분석 (로컬 전용, 선택)

Claude가 사진을 보고 답을 미리 고르고 사진 위에 선을 그립니다. API 키를 브라우저에 노출할 수 없어 GitHub Pages 버전에는 없습니다.

1. `pip install anthropic`
2. `.env`에 `ANTHROPIC_API_KEY=...` 추가 (`.gitignore`에 포함돼 있음)
3. `python server.py` → `[AI 분석 켜짐]` 확인

## 아직 없는 것

- 유료 심화 리포트 결제 (버튼과 안내 문구만 있음)
- 회원·결과 보관, 궁합, 양손 비교
- 자체 손금 인식 모델
