import http.client
import json

conn = http.client.HTTPSConnection("andruxnet-random-famous-quotes.p.rapidapi.com")

payload = "{}"
headers = {
    "x-rapidapi-key": "ce1ce42c51msh9b9f9545b7de1bbp103024jsna290b620e298",
    "x-rapidapi-host": "andruxnet-random-famous-quotes.p.rapidapi.com",
    "Content-Type": "application/json",
}

conn.request("POST", "/?count=10&cat=movies", payload, headers)
res = conn.getresponse()
data = res.read().decode("utf-8")

print("Status:", res.status)
print("Response:", data)

if res.status == 200:
    try:
        parsed = json.loads(data)
        print("\nParsed (pretty):")
        print(json.dumps(parsed, indent=2))
    except json.JSONDecodeError:
        pass
elif res.status == 308:
    print("\n(API returned 308 redirect; target path may be deprecated on RapidAPI.)")
