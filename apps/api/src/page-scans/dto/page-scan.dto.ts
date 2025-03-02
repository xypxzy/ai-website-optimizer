import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class CreatePageScanDto {
  @ApiProperty({ example: 'https://example.com' })
  @IsUrl()
  @IsNotEmpty()
  url: string;
}

export class PageScanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ required: false })
  screenshotUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  completedAt?: Date;
}
