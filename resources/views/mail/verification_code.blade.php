<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification – CiviCORE</title>
    <style>
        body { margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 40px 40px 32px; text-align: center; }
        .header img { width: 52px; height: 52px; margin-bottom: 16px; }
        .header h1 { color: #d4a574; font-size: 22px; font-weight: 900; margin: 0; letter-spacing: 0.05em; text-transform: uppercase; }
        .header p { color: #94a3b8; font-size: 12px; margin: 6px 0 0; letter-spacing: 0.15em; text-transform: uppercase; }
        .body { padding: 40px; }
        .body p { color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px; }
        .code-box { background: #f8fafc; border: 2px dashed #d4a574; border-radius: 16px; padding: 28px; text-align: center; margin: 28px 0; }
        .code-box .label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 10px; }
        .code-box .code { font-size: 46px; font-weight: 900; color: #0f172a; letter-spacing: 0.3em; font-family: 'Courier New', monospace; }
        .code-box .expiry { font-size: 11px; color: #94a3b8; margin-top: 10px; }
        .warning { background: #fff7ed; border-left: 4px solid #d4a574; border-radius: 8px; padding: 14px 18px; margin: 20px 0; }
        .warning p { font-size: 13px; color: #92400e; margin: 0; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center; }
        .footer p { font-size: 11px; color: #94a3b8; margin: 0; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <h1>CiviCORE</h1>
            <p>Civil Registry — Municipality of Naic</p>
        </div>
        <div class="body">
            <p>Hello,</p>
            <p>A new account is being created for <strong>{{ $email }}</strong> on the CiviCORE Civil Registry System. Use the verification code below to confirm this action:</p>
            <div class="code-box">
                <div class="label">Your Verification Code</div>
                <div class="code">{{ $code }}</div>
                <div class="expiry">This code expires in <strong>10 minutes</strong></div>
            </div>
            <div class="warning">
                <p>⚠️ If you did not request this, please ignore this email. No account will be created without this code.</p>
            </div>
            <p>Enter this code in the account creation form to complete registration.</p>
        </div>
        <div class="footer">
            <p>© {{ date('Y') }} CiviCORE — Civil Registry of Naic, Cavite &nbsp;|&nbsp; This is an automated message.</p>
        </div>
    </div>
</body>
</html>
