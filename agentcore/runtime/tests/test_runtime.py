import unittest
from unittest.mock import patch

from legal_agent import LegalDocumentAgent
from main import invoke
from review_contract import SYSTEM_PROMPT, ReviewRequest


class FakeBedrockClient:
    def __init__(self) -> None:
        self.request: dict = {}

    def converse(self, **kwargs: object) -> dict:
        self.request = kwargs
        return {
            "output": {
                "message": {
                    "content": [
                        {
                            "text": '{"findings": [], "disclaimer": "LexisGuide provides general information, not legal advice."}'
                        }
                    ]
                }
            }
        }


class RuntimeContractTests(unittest.TestCase):
    def test_agent_uses_the_shared_prompt_and_result_contract(self) -> None:
        client = FakeBedrockClient()

        result = LegalDocumentAgent(client=client, model_id="test-model").review(
            ReviewRequest(document="Example agreement.")
        )

        self.assertEqual(result["findings"], [])
        self.assertEqual(
            result["disclaimer"],
            "LexisGuide provides general information, not legal advice.",
        )
        self.assertEqual(client.request["system"], [{"text": SYSTEM_PROMPT}])

    def test_entrypoint_rejects_an_invalid_shared_request(self) -> None:
        self.assertEqual(
            invoke({"document": "Agreement", "unexpected": "field"})["error"],
            "Invalid review request",
        )

    def test_entrypoint_passes_a_shared_request_to_the_executor(self) -> None:
        with patch(
            "main.agent.review", return_value={"findings": [], "disclaimer": "test"}
        ) as review:
            response = invoke({"document_text": "Agreement", "action": "rewrite"})

        self.assertEqual(response, {"findings": [], "disclaimer": "test"})
        self.assertEqual(
            review.call_args.args[0],
            ReviewRequest(document="Agreement", action="rewrite"),
        )


if __name__ == "__main__":
    unittest.main()
