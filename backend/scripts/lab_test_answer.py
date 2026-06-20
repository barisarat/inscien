import json
import sys
import urllib.error
import urllib.request


API_URL = "http://localhost:8000/api/lab/answer"


TEST_QUERIES = [
    "How do I convert notebooks to HTML?",
    "What should I use to learn limit order book forecasting with FI-2010 and DeepLOB?",
    "Which podcast is useful for Bayesian statistics?",
]


def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def print_result(query, result):
    print("=" * 100)
    print(f"QUERY: {query}")
    print()
    print(result.get("answer", ""))
    print()
    print("CITATIONS:")

    for citation in result.get("citations", []):
        print(f"- {citation.get('title')} | {citation.get('sourceType')} | {citation.get('sectionTitle')} | {citation.get('url')}")

    print()
    print(f"retrievedCount: {result.get('retrievedCount')}")
    print(f"insufficientContext: {result.get('insufficientContext')}")
    print()


def main():
    for query in TEST_QUERIES:
        try:
            result = post_json(API_URL, {
                "query": query,
                "limit": 10,
            })

            print_result(query, result)
        except urllib.error.HTTPError as error:
            print(f"HTTP error for query: {query}")
            print(error.status)
            print(error.read().decode("utf-8"))
            sys.exit(1)
        except Exception as error:
            print(f"Failed query: {query}")
            print(str(error))
            sys.exit(1)


if __name__ == "__main__":
    main()