import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const sesClient = new SESv2Client({
  region: process.env.AWS_SES_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY!,
  },
});

const transporter = nodemailer.createTransport({
  SES: { sesClient, SendEmailCommand },
});

export const KINDLE_SENDER = "q2kindle <kindle@q2kindle.com>";

export async function sendToKindle(options: {
  to: string;
  subject: string;
  epubBuffer: Buffer;
  epubFilename: string;
}): Promise<void> {
  await transporter.sendMail({
    from: KINDLE_SENDER,
    to: options.to,
    subject: options.subject,
    html: "<div></div>", // Amazon Kindle rejects emails with no body (E009)
    attachments: [
      {
        filename: options.epubFilename,
        content: options.epubBuffer,
        contentType: "application/epub+zip",
      },
    ],
  });
}
