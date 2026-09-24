import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BucketPercentagesForm } from '@/spending-plan/bucket-percentages-form'
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
    onSuccess: (savedPlan) => queryClient.setQueryData(spendingPlanQueryKey, savedPlan),
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
      {spendingPlanQuery.isPending && (
        <p className="text-sm text-muted-foreground">Loading your plan…</p>
      )}
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
          onEdit={saveMutation.reset}
        />
      )}
      {saveMutation.isSuccess && (
        <p role="status" className="text-sm">
          Your spending plan is saved.
        </p>
      )}
      {saveMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't save your spending plan. Please try again.
        </p>
      )}
    </section>
  )
}
