-- Add PENDING status for INSTAPAY subscription payments awaiting manual
-- Super Admin verification. Centers keep working (non-blocking) while the
-- payment is confirmed against the payer's Instapay reference.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PENDING';