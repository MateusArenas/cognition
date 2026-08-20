import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PermissionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
