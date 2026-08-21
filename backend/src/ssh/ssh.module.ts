import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { HostsController } from './hosts.controller';
import { HostsService } from './hosts.service';
import { KnownHostsController } from './known-hosts.controller';
import { KnownHostsService } from './known-hosts.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SnippetsController } from './snippets.controller';
import { SnippetsService } from './snippets.service';
import { SshGateway } from './ssh.gateway';
import { SshManagerService } from './ssh-manager.service';

@Module({
  imports: [PermissionsModule],
  controllers: [HostsController, CredentialsController, KnownHostsController, SnippetsController, SessionsController],
  providers: [HostsService, CredentialsService, KnownHostsService, SessionsService, SnippetsService, SshManagerService, SshGateway],
})
export class SshModule {}
