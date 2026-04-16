curl -i -c cookies.txt -X POST https://tumejorversion-li.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin1234"}'

