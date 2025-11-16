import { Module } from '@nestjs/common';
import { CheckerService } from './checker.service';
import { ApiService } from 'src/markets/api.service';
import { HttpModule } from '@nestjs/axios';
import { DbModule } from 'src/db/db.module';
import { CheckerController } from './checker.controller';
import { MarketsModule } from 'src/markets/markets.module';

@Module({
  imports: [HttpModule, DbModule, MarketsModule ],
  providers: [CheckerService, ApiService],
  controllers: [CheckerController],
  exports: [CheckerService]
})
export class CheckerModule {}
