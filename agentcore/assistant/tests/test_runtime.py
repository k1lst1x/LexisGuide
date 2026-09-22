import unittest
from unittest.mock import patch

import main


class FakeBedrock:
    def converse(self, **kwargs):
        return {
            "stopReason": "end_turn",
            "output": {"message": {"role": "assistant", "content": [{"text": "A lien is a claim."}]}},
        }


class AssistantRuntimeTests(unittest.TestCase):
    def test_returns_a_chat_reply(self) -> None:
        with patch.object(main.agent, "_client", FakeBedrock()):
            result = main.invoke({"messages": [{"role": "user", "content": "What is a lien?"}]})
        self.assertEqual(result, {"reply": "A lien is a claim.", "tools_used": []})

    def test_rejects_an_invalid_request(self) -> None:
        result = main.invoke({"messages": []})
        self.assertEqual(result["error"], "Invalid chat request")


if __name__ == "__main__":
    unittest.main()
