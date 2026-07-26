import urllib.request
import urllib.error

body = (
    b"--BOUNDARY\r\n"
    + b'Content-Disposition: form-data; name="file"; filename="test.csv"\r\n'
    + b"Content-Type: text/csv\r\n\r\n"
    + b"dummy,csv\n1,2\r\n"
    + b"--BOUNDARY--\r\n"
)

req = urllib.request.Request(
    "http://127.0.0.1:3000/api/v1/analyze/forecast",
    data=body, method="POST",
)
req.add_header("Content-Type", "multipart/form-data; boundary=BOUNDARY")

try:
    with urllib.request.urlopen(req) as r:
        print("HTTP", r.status)
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP ERROR", e.code)
    print(e.read().decode())
except Exception as e:
    print("FAILED", e)
