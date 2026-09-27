import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { showSaveFailedToast, showSavedToast } from '@/lib/save-toasts'
import { BucketPercentagesForm } from '@/spending-plan/bucket-percentages-form'
import { BUCKETS } from '@/spending-plan/buckets'
import {
  fetchSpendingPlan,
  spendingPlanQueryKey,
  updateSpendingPlan,
} from '@/spending-plan/spending-plan-api'

export function PlanPage() {
  const queryClient = useQueryClient()
  const spendingPlanQuery = useQuery({ queryKey: spendingPlanQueryKey, queryFn: fetchSpendingPlan })
  const saveMutation = useMutation({
    mutationFn: updateSpendingPlan,
    onSuccess: (savedPlan) => {
      showSavedToast('Spending plan saved')
      queryClient.setQueryData(spendingPlanQueryKey, savedPlan)
    },
    // The form keeps what the user typed, to try again.
    onError: showSaveFailedToast,
  })

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Spending plan</h1>
        <p className="text-muted-foreground">
          How your income is split between Fixed Costs, Investments, Savings and Guilt-Free
          Spending. New months start with these percentages.
        </p>
      </div>
      {spendingPlanQuery.isPending && <SpendingPlanSkeleton />}
      {spendingPlanQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't load your spending plan. Please reload the page.
        </p>
      )}
      {spendingPlanQuery.isSuccess && (
        <BucketPercentagesForm
          initialPercentages={spendingPlanQuery.data}
          onSave={saveMutation.mutate}
          isSaving={saveMutation.isPending}
          submitLabel="Save plan"
        />
      )}
    </section>
  )
}

/** Stands in for the plan form: the income preview, a row per bucket, the total and the button. */
function SpendingPlanSkeleton() {
  return (
    <LoadingSkeleton label="Loading your plan…" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="divide-y rounded-md border">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="flex items-center gap-4 p-4">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-28" />
    </LoadingSkeleton>
  )
}
