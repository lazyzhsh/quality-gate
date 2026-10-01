package com.example;

import java.util.List;

import com.example.Order;
import org.apache.commons.lang3.StringUtils;

public class Main {
    public static void main(String[] args) {
        List<Order> orders = List.of(new Order("o-1"));
        System.out.println(StringUtils.join(orders.stream().map(Order::getId).toArray()));
    }
}
