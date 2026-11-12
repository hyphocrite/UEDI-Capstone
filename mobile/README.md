# UDEI Member (mobile app)

Expo / React Native app for UDEI members. It talks to the same Express API as the office web app,
through the member-only routes in `server/src/routes/member.js`.

What a member can do:

- Create a member account (name, email, UDEI member number, password) and sign in.
- Apply for a Long term or Emergency loan (the Mutual Assistance form, with payroll-deduction and
  auto-restructuring consent). The server sets the interest rate; the ML model scores it like any other application.
- Follow the application through the four signers: Bookkeeper, Treasurer, CreCom Chairman, President.
- See loan balances, the payment schedule, payments received and the next due date.
- Get due-date reminders on the phone (local notifications, 3 days before and on the day, 8:00 AM).

Members never see model scores, other members' records or any staff page. Member accounts can't sign in
on the office web app, and staff accounts can't sign in on the phone.

## Run it on your phone

1. Start MongoDB, the ml-service and the server as usual (`server`: `npm run dev`).
2. Find your laptop's Wi-Fi IP (`ipconfig` on Windows), then:

   ```bash
   cd mobile
   npm install
   cp .env.example .env      # set EXPO_PUBLIC_API_URL=http://<laptop-ip>:5000/api
   npx expo start
   ```

3. Install **Expo Go** on the phone, connect it to the same Wi-Fi, and scan the QR code.
   If Windows Firewall asks, allow Node.js on private networks so the phone can reach port 5000.

`npx expo start --web` opens it in a browser for a quick look (no secure storage or reminders there).

## Notes

- Amounts from `/api/member/loans` are integer centavos, like `/api/loans`.
- Loans show up for a member when they came from that member's own app application. Linking older
  office-entered loans to a member account by member number needs a staff verification step first
  (not built yet), so someone can't see another member's loans by typing their number.
- Push notifications from the server (for example "your loan was approved") need a development build
  and EAS; the local reminders work in Expo Go.
