<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Contracts\Queue\ShouldQueue;

class VerificationCodeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    protected string $code;
    protected string $email;

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
