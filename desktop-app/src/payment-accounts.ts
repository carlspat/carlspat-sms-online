export type PaymentAccount = { purpose: 'examinations' | 'school-fees'; title: string; bank: string; accountNumber: string; accountName: string }
const examination: PaymentAccount = { purpose: 'examinations', title: 'Examination fees', bank: 'Sterling Bank', accountNumber: '0007703228', accountName: 'Olufunmilayo Comprehensive High School' }
const schoolFees: PaymentAccount = { purpose: 'school-fees', title: 'Primary and Secondary school fees', bank: 'Sterling Bank', accountNumber: '0072222815', accountName: 'Olufunmilayo Comprehensive High School' }

export function paymentAccountsForRoles(roles: string[]): PaymentAccount[] {
  if (roles.includes('Stakeholder')) return [examination]
  if (roles.some(role => ['Parent', 'Student', 'Super Admin', 'Finance Officer'].includes(role))) return [schoolFees, examination]
  return []
}
