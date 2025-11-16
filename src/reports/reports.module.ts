import { Module, forwardRef } from '@nestjs/common';
import { ReportsConfig } from './reports.config';
import { ReportsService } from './reports.service';
import { ReportFormatterService } from './services/report-formatter.service';
import { ReportSenderService } from './services/report-sender.service';
import { EncryptionService } from './services/encryption.service';
import { ReportGeneratorService } from './services/report-generator.service';
import { DbModule } from 'src/db/db.module';
import { MarketsModule } from 'src/markets/markets.module';

@Module({
  imports: [DbModule, forwardRef(() => MarketsModule)],
  providers: [
    ReportsConfig,
    ReportsService,
    ReportFormatterService,
    ReportSenderService,
    EncryptionService,
    ReportGeneratorService
  ],
  exports: [ReportsConfig, ReportsService]
})
export class ReportsModule {}
