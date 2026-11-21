import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Your Account & Data — BidForGem",
  description: "How to delete your BidForGem account and what data is removed.",
};

export default function DataDeletionPage(): React.ReactElement {
  return (
    <div className="narrow" style={{ margin: "24px auto 0" }}>
      <div className="card">
        <h1>Delete your account &amp; data</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          BidForGem — account and data deletion
        </p>

        <p style={{ marginTop: 16 }}>
          You can permanently delete your BidForGem account at any time using either method below.
        </p>

        <h3 style={{ marginTop: 20 }}>In the app</h3>
        <ol className="muted" style={{ lineHeight: 1.7 }}>
          <li>Open BidForGem and sign in.</li>
          <li>Tap your profile (your name in the top-right of the home screen).</li>
          <li>
            Under <strong>Danger zone</strong>, tap <strong>Delete account</strong>.
          </li>
          <li>
            Confirm with your password and tap <strong>Permanently delete</strong>.
          </li>
        </ol>
        <p className="muted">
          On the web, the same option is available on your <a href="/profile">profile page</a> under
          “Delete account”.
        </p>

        <h3 style={{ marginTop: 20 }}>By request</h3>
        <p className="muted">
          If you can’t access your account, email{" "}
          <a href="mailto:bidforgem@gmail.com">bidforgem@gmail.com</a> from the address on your
          account and we’ll delete it for you.
        </p>

        <h3 style={{ marginTop: 20 }}>What is deleted</h3>
        <ul className="muted" style={{ lineHeight: 1.7 }}>
          <li>Your account name, email address, and contact numbers are removed.</li>
          <li>Sign-in is permanently disabled and your sign-in sessions are revoked.</li>
        </ul>

        <h3 style={{ marginTop: 20 }}>What is retained</h3>
        <p className="muted">
          Published listings, photos, and bid history may remain to preserve auction records.
          Retained records display your account as “Deleted user”. If a listing or photo contains
          personal information you want removed, contact us using the email below. Account deletion
          cannot be undone.
        </p>

        <h3 style={{ marginTop: 20 }}>Contact</h3>
        <p className="muted">
          Questions: <a href="mailto:bidforgem@gmail.com">bidforgem@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
