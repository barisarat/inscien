import json
import sys
import urllib.error
import urllib.request


API_URL = "http://localhost:8000/api/lab/search"


TEST_QUERIES = [
    "What datasets were used for evaluation?",
    "machine learning methods for price prediction",
    "how is model performance measured",
    "limitations and future work",
    "deep learning architecture details",
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

    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def print_result(query, result):
    print("=" * 100)
    print(f"QUERY: {query}")
    print(f"COUNT: {result.get('count')}")
    print()

    for index, item in enumerate(result.get("results", []), start=1):
        print(f"{index}. {item.get('title')}")
        print(f"   score: {item.get('score')}")
        print(f"   type: {item.get('sourceType')}")
        print(f"   category: {item.get('category')}")
        print(f"   section: {item.get('sectionTitle')}")
        print(f"   url: {item.get('url')}")

        text = item.get("text", "")
        snippet = text[:350].replace("\n", " ")

        print(f"   snippet: {snippet}")
        print()


def main():
    for query in TEST_QUERIES:
        try:
            result = post_json(API_URL, {
                "query": query,
                "limit": 5,
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