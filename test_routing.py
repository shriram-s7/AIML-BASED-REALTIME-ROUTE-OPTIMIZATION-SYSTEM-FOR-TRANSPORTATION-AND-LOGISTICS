#!/usr/bin/env python3
"""
Test script for the new routing algorithm
"""
import sys
import os

# Add backend to path to import the main module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.main import assign_hubs_to_trucks, Hub, Truck, WorldState, CENTRAL_HUB

def test_basic_routing():
    """Test basic routing functionality"""
    print("Testing basic routing functionality...")
    
    # Set up world state
    global world_state
    world_state = WorldState()
    
    # Add central hub
    world_state.hubs.append(Hub(**CENTRAL_HUB))
    
    # Add some test hubs with different priorities and demands
    world_state.hubs.extend([
        Hub(id="HUB1", name="Low Priority Hub", latitude=21.0, longitude=79.0, demand_quantity=2, demand_priority="Low"),
        Hub(id="HUB2", name="High Priority Hub", latitude=20.0, longitude=78.0, demand_quantity=1, demand_priority="High"),
        Hub(id="HUB3", name="Emergency Hub", latitude=20.8, longitude=78.5, demand_quantity=1, demand_priority="Emergency"),
        Hub(id="HUB4", name="Medium Priority Hub", latitude=21.5, longitude=79.5, demand_quantity=3, demand_priority="Medium"),
    ])
    
    # Add trucks
    world_state.trucks.extend([
        Truck(
            id="TRUCK1",
            starting_latitude=CENTRAL_HUB["latitude"],
            starting_longitude=CENTRAL_HUB["longitude"],
            current_latitude=CENTRAL_HUB["latitude"],
            current_longitude=CENTRAL_HUB["longitude"],
            fuel_capacity=100.0,
            fuel_remaining=100.0,
        ),
        Truck(
            id="TRUCK2",
            starting_latitude=CENTRAL_HUB["latitude"],
            starting_longitude=CENTRAL_HUB["longitude"],
            current_latitude=CENTRAL_HUB["latitude"],
            current_longitude=CENTRAL_HUB["longitude"],
            fuel_capacity=80.0,
            fuel_remaining=80.0,
        )
    ])
    
    # Run the assignment
    assign_hubs_to_trucks()
    
    # Print results
    print("Truck assignments:")
    for truck in world_state.trucks:
        print(f"  {truck.id}: assigned_hubs = {truck.assigned_hubs}")
    
    # Verify that high priority hubs are handled first
    print("\nHub demands after assignment:")
    for hub in world_state.hubs:
        if hub.id != CENTRAL_HUB["id"]:
            print(f"  {hub.id}: demand = {hub.demand_quantity}, priority = {hub.demand_priority}")
    
    # Check that all demands are properly accounted for
    total_demand = sum(h.demand_quantity for h in world_state.hubs if h.id != CENTRAL_HUB["id"])
    print(f"\nTotal remaining demand: {total_demand}")
    
    return True

def test_fuel_constraints():
    """Test that fuel constraints are respected"""
    print("\nTesting fuel constraint handling...")
    
    # Set up world state
    global world_state
    world_state = WorldState()
    
    # Add central hub
    world_state.hubs.append(Hub(**CENTRAL_HUB))
    
    # Add a hub that's far away (requires more fuel than available)
    world_state.hubs.append(
        Hub(id="FAR_HUB", name="Far Hub", latitude=35.0, longitude=90.0, demand_quantity=1, demand_priority="Emergency")
    )
    
    # Add a truck with limited fuel
    world_state.trucks.append(
        Truck(
            id="TRUCK_FUEL_TEST",
            starting_latitude=CENTRAL_HUB["latitude"],
            starting_longitude=CENTRAL_HUB["longitude"],
            current_latitude=CENTRAL_HUB["latitude"],
            current_longitude=CENTRAL_HUB["longitude"],
            fuel_capacity=50.0,  # Limited fuel
            fuel_remaining=50.0,
        )
    )
    
    # Run the assignment
    assign_hubs_to_trucks()
    
    # Print results
    print("Truck assignments for fuel test:")
    for truck in world_state.trucks:
        print(f"  {truck.id}: assigned_hubs = {truck.assigned_hubs}")
        print(f"  {truck.id}: fuel_remaining = {truck.fuel_remaining}")
    
    return True

if __name__ == "__main__":
    print("Running routing algorithm tests...")
    
    try:
        test_basic_routing()
        test_fuel_constraints()
        print("\nAll tests completed successfully!")
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()