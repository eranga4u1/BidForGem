import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BidForGem",
  description: "How BidForGem collects, uses, and protects your data.",
};

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <div className="card">
        <h1>Privacy Policy</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Last updated: September 2026
        </p>

        <p style={{ marginTop: 16 }}>
          BidForGem (“we”, “the app”) operates a marketplace for buying and selling gemstones by
          auction. This policy explains what we collect and how we use it.
        </p>

        <h3 style={{ marginTop: 20 }}>Information we collect</h3>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>
            <strong>Account information:</strong> your name, email address, and a securely hashed
            password.
          </li>
          <li>
            <strong>Content you provide:</strong> gem listings you create, photos you upload, and
            bids you place.
          </li>
          <li>
            <strong>Technical data:</strong> your IP address and device/browser information, used to
            operate the service, apply rate limits, and protect against abuse.
          </li>
        </ul>

        <h3 style={{ marginTop: 20 }}>How we use it</h3>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>
            To provide the marketplace: authentication, listings, live auctions, bidding, and
            notifications.
          </li>
          <li>To secure your account and prevent fraud and abuse.</li>
          <li>
            To send transactional emails (welcome, password reset, outbid, and auction result
            notices).
          </li>
        </ul>

        <h3 style={{ marginTop: 20 }}>Sharing</h3>
        <p className="muted">
          We do not sell your personal information. We share data only with service providers who
          help us run the app — cloud hosting, object storage for images, and email delivery — and
          only as needed to provide the service.
        </p>

        <h3 style={{ marginTop: 20 }}>Data retention and deletion</h3>
        <p className="muted">
          You can permanently delete your account at any time from your profile in the app, or by
          contacting us at the address below. When you delete your account, we remove your personal
          information (name, email) and disable sign-in. Records required for marketplace integrity,
          such as past bids, are retained in anonymized form and shown as “Deleted user”. See our{" "}
          <a href="/data-deletion">account &amp; data deletion</a> page for details.
        </p>

        <h3 style={{ marginTop: 20 }}>Security</h3>
        <p className="muted">
          Data is transmitted over encrypted connections (HTTPS). Passwords are stored only as
          salted hashes; access tokens are short-lived.
        </p>

        <h3 style={{ marginTop: 20 }}>Children</h3>
        <p className="muted">
          BidForGem is intended for users aged 18 and over and is not directed at children.
        </p>

        <h3 style={{ marginTop: 20 }}>Contact</h3>
        <p className="muted">
          Questions or deletion requests:{" "}
          <a href="mailto:bidforgem@gmail.com">bidforgem@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
