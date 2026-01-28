import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomPageComponent } from './room-page';

describe('RoomPage', () => {
  let component: RoomPageComponent;
  let fixture: ComponentFixture<RoomPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
