<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class VerificationCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $code;
    public string $email;

    public function __construct(string $email, string $code)
    {
        $this->email = $email;
        $this->code  = $code;
    }

    public function build()
    {
        return $this
            ->subject('CiviCORE — Your Account Verification Code')
            ->view('mail.verification_code')
            ->with([
                'code'  => $this->code,
                'email' => $this->email,
            ]);
    }
}
