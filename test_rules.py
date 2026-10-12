"""site/rules.json 해석 데이터 검사. 실행: python test_rules.py"""
import json
import unittest
from pathlib import Path

RULES = json.loads((Path(__file__).parent / "site" / "rules.json").read_text(encoding="utf-8"))
CATEGORIES = {c["id"] for c in RULES["categories"]}
QUESTIONS = {q["id"]: {o["value"] for o in q["options"]} for q in RULES["questions"]}
HAND_QUESTIONS = {"palm_shape", "finger_length"}


class RulesTest(unittest.TestCase):
    def test_feature_rules_match_questions(self):
        for qid, values in RULES["features"].items():
            self.assertIn(qid, QUESTIONS)
            for value, rule in values.items():
                self.assertIn(value, QUESTIONS[qid], f"{qid}:{value}")
                self.assertTrue(rule["observe"])
                self.assertLessEqual(set(rule["texts"]), CATEGORIES)

    def test_every_question_is_used(self):
        self.assertEqual(set(QUESTIONS), set(RULES["features"]) | HAND_QUESTIONS)

    def test_hand_types(self):
        self.assertEqual(set(RULES["hand_types"]), {"earth", "air", "fire", "water"})
        for hand in RULES["hand_types"].values():
            self.assertLessEqual(set(hand["texts"]), CATEGORIES)

    def test_every_category_always_gets_text(self):
        # 재물·활력은 손 유형 문장이 없으므로 모든 답에서 문장이 나오는지 확인
        for cat, qid in (("money", "sun"), ("energy", "life_arc")):
            for value in QUESTIONS[qid]:
                self.assertIn(cat, RULES["features"][qid][value]["texts"], f"{qid}:{value}")

    def test_index_keys_are_valid(self):
        for idx in RULES["indices"]:
            for key in idx["add"]:
                qid, value = key.split(":")
                if qid == "hand":
                    self.assertIn(value, RULES["hand_types"])
                else:
                    self.assertIn(value, QUESTIONS[qid], key)

    def test_skip_rules_point_at_real_answers(self):
        for q in RULES["questions"]:
            for qid, value in q.get("skip_if", {}).items():
                self.assertIn(value, QUESTIONS[qid])

    def test_no_banned_words(self):
        text = json.dumps([RULES["features"], RULES["hand_types"], RULES["daily_words"]], ensure_ascii=False)
        for word in ("단명", "수명", "질병", "이혼", "자살"):
            self.assertNotIn(word, text)


if __name__ == "__main__":
    unittest.main()
