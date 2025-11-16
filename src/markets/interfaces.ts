export interface CheckCommissionsResponse {
  userEmail: string;
  period: {
    start: number;
    end: number;
    startFormatted: string;
    endFormatted: string;
  };
  totalProfit: number;
  commissionCalculated: number;
  commissionPercent: number;
  apis: Array<{
    apiName: string;
    profit: number;
    commission: number;
  }>;
  details: {
    userCommission: any;
    apiCommissions: any[];
    calculations: any;
  };
}

export interface GetUserReportRequest {
  email: string;
  start: number;
  end: number;
}
