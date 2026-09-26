from lexisguide_assistant import parse_chat_request

from app import assistant_research


def test_research_uses_only_an_explicit_citation_and_preserves_its_receipt(monkeypatch) -> None:
    class Client:
        def lookup_statute(self, jurisdiction, citation):
            assert (jurisdiction, citation) == ("FL", "768.28")
            return {
                "text": "Official statute text",
                "sourceUrl": "https://example.gov/statutes/768.28",
                "retrievedAt": "2026-09-25T00:00:00Z",
            }

    monkeypatch.setattr(assistant_research, "configured_lawfirm_client", lambda: Client())
    request = parse_chat_request(
        {
            "messages": [{"role": "user", "content": "Explain § 768.28"}],
            "context": {"jurisdiction": "FL"},
        }
    )

    enriched = assistant_research.add_official_source(request)

    assert enriched.context.authority_sources == [
        {
            "citation": "768.28",
            "text": "Official statute text",
            "url": "https://example.gov/statutes/768.28",
            "retrieved_at": "2026-09-25T00:00:00Z",
        }
    ]
