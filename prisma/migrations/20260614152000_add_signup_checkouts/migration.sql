CREATE TABLE "SignupCheckout" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_slug" TEXT NOT NULL,
    "admin_name" TEXT NOT NULL,
    "admin_username" TEXT NOT NULL,
    "admin_password" TEXT NOT NULL,
    "payer_email" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mp_payment_id" TEXT,
    "mp_payment_url" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupCheckout_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SignupCheckout" ADD CONSTRAINT "SignupCheckout_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
