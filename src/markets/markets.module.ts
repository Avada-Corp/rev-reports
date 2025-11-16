import { Module, forwardRef } from "@nestjs/common";
import { MarketsController } from "./markets.controller";
import { MarketsService } from "./markets.service";
import { HttpModule } from "@nestjs/axios";
import { DbModule } from "src/db/db.module";
import { ApiService } from "./api.service";
import { ReportsModule } from "src/reports/reports.module";
import { CommissionCheckModule } from "src/commission-check/commission-check.module";

@Module({
  imports: [HttpModule, DbModule, forwardRef(() => ReportsModule), forwardRef(() => CommissionCheckModule)],
  controllers: [MarketsController],
  providers: [MarketsService, ApiService],
  exports: [MarketsService, ApiService]
})
export class MarketsModule {}
