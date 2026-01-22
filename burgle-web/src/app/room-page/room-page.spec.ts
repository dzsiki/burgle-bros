import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomPage } from './room-page';

describe('RoomPage', () => {
  let component: RoomPage;
  let fixture: ComponentFixture<RoomPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
