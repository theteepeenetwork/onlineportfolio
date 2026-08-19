-- Which school band a subscription was bought on ("school_small" ... "school_large").
-- A price label only: nothing reads it to allow or refuse anything, and it is
-- NULL on every free teacher plan and on a school still evaluating on trial.
ALTER TABLE "Subscription" ADD COLUMN "planKey" TEXT;
