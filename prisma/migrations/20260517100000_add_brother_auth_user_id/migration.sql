ALTER TABLE "Brother" ADD COLUMN "auth_user_id" TEXT;
CREATE UNIQUE INDEX "Brother_auth_user_id_key" ON "Brother"("auth_user_id");
