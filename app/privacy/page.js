export default function PrivacyPolicy() {
  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)" }}>
      <div style={{
        maxWidth: "680px", margin: "0 auto", padding: "60px 24px 80px",
        fontFamily: "'DM Sans', sans-serif", color: "var(--text)", lineHeight: "1.7"
      }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "36px", fontWeight: 400, marginBottom: "8px", color: "var(--text)" }}>
          Privacy Policy
        </h1>
        <p style={{ color: "var(--text2)", fontSize: "14px", marginBottom: "40px" }}>
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

      <Section title="Overview">
        fe-Mail is a personal email client that connects to your Gmail account. We take your privacy seriously.
        This policy explains what data we access, how we use it, and what we never do with it.
      </Section>

      <Section title="What we access">
        When you sign in with Google, fe-Mail requests access to your Gmail account in order to:
        <ul style={{ marginTop: "10px", paddingLeft: "20px" }}>
          <li>Read your emails so they can be displayed in the app</li>
          <li>Send emails on your behalf when you compose or reply</li>
          <li>Read your basic profile information (name and email address)</li>
        </ul>
      </Section>

      <Section title="What we do not do">
        <ul style={{ paddingLeft: "20px" }}>
          <li>We do not store your emails on our servers</li>
          <li>We do not sell your data to third parties</li>
          <li>We do not use your email content to train AI models</li>
          <li>We do not share your personal information with anyone</li>
          <li>We do not show you ads</li>
        </ul>
      </Section>

      <Section title="Data storage">
        fe-Mail stores only minimal data locally in your browser (such as read/unread state, tags, and folders
        you create). Your emails are fetched directly from Gmail and are never stored on our servers.
        Your Gmail access token is handled securely and never exposed to the browser.
      </Section>

        <Section title="Google API">
        fe-Mail's use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy"
          style={{ color: "var(--accent)" }}>
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </Section>

      <Section title="Third-party services">
        fe-Mail uses the following third-party services:
        <ul style={{ marginTop: "10px", paddingLeft: "20px" }}>
          <li>Google OAuth — for authentication</li>
          <li>Gmail API — for reading and sending emails</li>
          <li>Vercel — for hosting the application</li>
        </ul>
      </Section>

      <Section title="Children's privacy">
        fe-Mail is not directed at children under 13. We do not knowingly collect data from children.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy from time to time. Changes will be posted on this page with an updated date.
        Continued use of fe-Mail after changes means you accept the updated policy.
      </Section>

        <Section title="Contact">
        If you have questions about this privacy policy, contact us at:{" "}
        <a href="mailto:rijankanxo111@gmail.com" style={{ color: "var(--accent)" }}>
          rijankanxo111@gmail.com
        </a>
      </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px", color: "var(--text)" }}>
        {title}
      </h2>
      <div style={{ fontSize: "15px", color: "var(--text2)" }}>{children}</div>
    </div>
  )
}
